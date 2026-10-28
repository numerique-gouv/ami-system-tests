/**
 * Socle HTTP de l'API partenaire AMI : URL du backend, authentification, délai d'attente.
 *
 * Variables (.env / .env.staging) :
 *   AMI_ENV              — environnement cible (titre ou numéro de PR) ; en webapp, l'URL en est
 *                          dérivée par resolveEnvironment() (environment.ts).
 *   NOTIF_PARTNER_ID     — identifiant du partenaire AMI (`dinum-ami`, partenaire SYSTÈME, consentement non activé côté backend)
 *   NOTIF_PARTNER_SECRET — secret du partenaire AMI (HTTP Basic auth)
 *   NOTIF_PARTNER_<SLUG>_ID / NOTIF_PARTNER_<SLUG>_SECRET — identifiants d'UN AUTRE partenaire, <SLUG> = son identifiant en majuscules,
 *                          tout caractère non alphanumérique remplacé par `_` (`dinum-dn` → NOTIF_PARTNER_DINUM_DN_ID / _SECRET ;
 *                          `dinum-rdvsp` → NOTIF_PARTNER_DINUM_RDVSP_ID / _SECRET). Les secrets viennent de Scalingo (PARTNERS_<SLUG>_SECRET).
 *                          Les scénarios qui exigent un partenaire à consentement activé (S5, S5.2, S6.3) en ont besoin : absents, ils sont SKIPPÉS.
 *
 * L'URL backend est définie via setBackendUrl() : en mobile, par EnvironmentPickerPage.reviewEnvironmentPicker()
 * depuis le titre de l'item cliqué dans le picker ; en webapp, depuis resolveEnvironment() (AMI_ENV).
 */

import {backendUrlFor} from '../common/environment'

// Sans timeout, un fetch() sur une connexion coupée reste pendu jusqu'au timeout Mocha du
// hook/test appelant (120-180s) au lieu d'échouer vite avec un message clair.
export const REQUEST_TIMEOUT_MS = 15000

// URL du backend pour la session courante — fixée par setBackendUrl() lors du choix de l'env.
// Par défaut dérivée d'AMI_ENV : les builds préprod n'ont pas de sélecteur d'environnement pour l'appeler.
let _backendUrl: string = backendUrlFor(process.env.AMI_ENV ?? '')

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

/** Identifiant du partenaire AMI : ses identifiants sont les NOTIF_PARTNER_ID / NOTIF_PARTNER_SECRET historiques. */
const AMI_PARTNER = 'dinum-ami'

/** Noms des deux variables d'environnement portant les identifiants Basic du partenaire (`id`, `secret`). */
export function partnerCredentialVariables(partner: string): {id: string; secret: string} {
    if (partner === AMI_PARTNER) return {id: 'NOTIF_PARTNER_ID', secret: 'NOTIF_PARTNER_SECRET'}
    const slug = partner.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    return {id: `NOTIF_PARTNER_${slug}_ID`, secret: `NOTIF_PARTNER_${slug}_SECRET`}
}

/** Les identifiants du partenaire sont-ils renseignés (`.env.staging`) ? */
export function hasPartnerCredentials(partner: string = AMI_PARTNER): boolean {
    const vars = partnerCredentialVariables(partner)
    return Boolean(process.env[vars.id]) && Boolean(process.env[vars.secret])
}

/** Message qui dit précisément quelles variables manquent pour appeler l'API au nom du partenaire. */
export function missingPartnerCredentialsMessage(partner: string): string {
    const vars = partnerCredentialVariables(partner)
    const missing = [vars.id, vars.secret].filter(name => !process.env[name])
    return `Identifiants du partenaire « ${partner} » absents : renseigner ${missing.join(' et ')} dans .env.local ` +
        `(secret : variable PARTNERS_${partner.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_SECRET de l'application Scalingo du backend).`
}

/** En-tête HTTP Basic du partenaire (AMI par défaut). */
export function authHeaders(partner: string = AMI_PARTNER): {Authorization: string} {
    if (!hasPartnerCredentials(partner)) throw new Error(missingPartnerCredentialsMessage(partner))
    const vars = partnerCredentialVariables(partner)
    const partnerId = requireEnv(vars.id)
    const secret = requireEnv(vars.secret)
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
            'Copier .env en .env.staging et renseigner les valeurs.'
        )
    }
    return val
}
