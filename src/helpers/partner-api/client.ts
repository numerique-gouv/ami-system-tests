/**
 * Socle HTTP de l'API partenaire AMI : URL du backend, authentification, délai d'attente.
 *
 * Variables (.env / .env.local) :
 *   AMI_ENV              — environnement cible (titre ou numéro de PR) ; en webapp, l'URL en est
 *                          dérivée par resolveEnvironment() (environment.ts).
 *   NOTIF_PARTNER_ID     — identifiant partenaire
 *   NOTIF_PARTNER_SECRET — secret partenaire (HTTP Basic auth)
 *
 * L'URL backend est définie via setBackendUrl() : en mobile, par EnvironmentPickerPage.reviewEnvironmentPicker()
 * depuis le titre de l'item cliqué dans le picker ; en webapp, depuis resolveEnvironment() (AMI_ENV).
 */

const STAGING_BASE_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'

// Sans timeout, un fetch() sur une connexion coupée reste pendu jusqu'au timeout Mocha du
// hook/test appelant (120-180s) au lieu d'échouer vite avec un message clair.
export const REQUEST_TIMEOUT_MS = 15000

// URL du backend pour la session courante — fixée par setBackendUrl() lors du choix de l'env.
let _backendUrl: string = STAGING_BASE_URL

/**
 * Définit l'URL backend pour toute la session de test.
 * Appelé par EnvironmentPickerPage.reviewEnvironmentPicker() (mobile) dès que l'environnement est
 * sélectionné ; en webapp, l'URL vient de resolveEnvironment() (environment.ts).
 */
export function setBackendUrl(url: string): void {
    _backendUrl = url
}

export function getBackendUrl(): string {
    return _backendUrl
}

export function authHeaders(): {Authorization: string} {
    const partnerId = requireEnv('NOTIF_PARTNER_ID')
    const secret = requireEnv('NOTIF_PARTNER_SECRET')
    const credentials = Buffer.from(`${partnerId}:${secret}`).toString('base64')
    return {Authorization: `Basic ${credentials}`}
}

/** Nom d'application Scalingo dérivé de l'URL backend courante. */
function scalingoAppName(): string {
    const match = /^https:\/\/([a-z0-9-]+)\.osc-fr1\.scalingo\.io/.exec(_backendUrl)
    return match ? match[1] : _backendUrl
}

/**
 * Message d'aide au diagnostic pour un échec de PROPAGATION (événement publié avec succès — pas de 5xx,
 * déjà couvert par publishEvent — mais jamais visible côté app dans le budget de polling du test).
 * Aucune corrélation automatique possible depuis ce dépôt : on oriente vers les logs serveur pour
 * distinguer latence normale, erreur de traitement asynchrone, etc.
 */
export function scalingoLogsHint(sinceMs: number): string {
    const windowS = Math.round((Date.now() - sinceMs) / 1000)
    return `Vérifier les logs Scalingo (app "${scalingoAppName()}", fenêtre ≈${windowS}s) pour le traitement côté serveur.`
}

function requireEnv(name: string): string {
    const val = process.env[name]
    if (!val) {
        throw new Error(
            `Variable d'environnement manquante : ${name}. ` +
            'Copier .env en .env.local et renseigner les valeurs.'
        )
    }
    return val
}
