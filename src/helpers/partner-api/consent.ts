/**
 * Consentement d'un usager aux DÉMARCHES d'un partenaire — API `/api/v1/consent/{fc_hash}`.
 *
 * Ce consentement est propre à chaque PARTENAIRE (une case par partenaire dans Préférences > Suivi des démarches :
 * `dinum-ami`, `dinum-dn`…). S'il est refusé, le backend REFUSE de recevoir les événements du partenaire et l'app
 * (iOS, Android, web) ne reçoit donc pas ses démarches : c'est la porte d'entrée backend des événements du partenaire.
 * Le partenaire visé par l'appel est celui des identifiants Basic (`NOTIF_PARTNER_ID`) ; le paramètre `partner` le rend
 * explicite à l'appel et dans les messages d'erreur, il ne change pas la requête.
 *
 * À ne pas confondre avec les NOTIFICATIONS PUSH : réglage global à AMI (pas par partenaire), local au front / à l'API
 * mobile, soumis à la permission du système (navigateur, Android ; iOS : appareil physique seulement). Aucun endpoint ne
 * l'active : il n'y a donc volontairement aucun helper API pour lui ici (côté UI : PreferencesPage, réglage « Notifications »).
 *
 * NON CONFIRMÉ : si un événement « notification » simple (sans démarche) publié par le partenaire passe lui aussi par cette
 * porte de consentement côté backend. Les specs S5 et S5.2 (consentement.md) l'exercent sans l'avoir établi.
 */
import {AssertionError} from 'node:assert'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl} from './client'

/** Identifiant d'un partenaire, tel qu'il nomme la case de Préférences > Suivi des démarches (attribut `name`). */
export type PartnerId = string

/** AMI lui-même : le partenaire des identifiants de test (`NOTIF_PARTNER_ID`). */
export const PARTNER_AMI: PartnerId = 'dinum-ami'
/** Démarche Numérique (case « Démarche Numérique » du suivi des démarches). */
export const PARTNER_DN: PartnerId = 'dinum-dn'

/**
 * Vérifie le consentement aux démarches du partenaire auprès d'AMI (GET /api/v1/consent/{fc_hash}).
 * Retourne true si actif, false si 404 (absent ou retiré).
 */
export async function checkDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<boolean> {
    const url = `${getBackendUrl()}/api/v1/consent/${recipientFcHash}`
    let response: Response
    try {
        response = await fetch(url, {
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        throw new AssertionError({message: `GET /api/v1/consent/${recipientFcHash} (partenaire ${partner}) → pas de réponse sous ${REQUEST_TIMEOUT_MS}ms (${(err as Error).message})`})
    }
    if (response.status === 404) return false
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `GET /api/v1/consent/${recipientFcHash} (partenaire ${partner}) → HTTP ${response.status}: ${text}`})
    }
    return true
}

/** Communique le consentement aux démarches du partenaire (don ou retrait) (POST /api/v1/consent/{fc_hash}). */
async function setDemarchesConsent(partner: PartnerId, recipientFcHash: string, granted: boolean): Promise<void> {
    const url = `${getBackendUrl()}/api/v1/consent/${recipientFcHash}`
    let response: Response
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...authHeaders()},
            body: JSON.stringify({consent: granted}),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
    } catch (err) {
        throw new AssertionError({message: `POST /api/v1/consent/${recipientFcHash} (partenaire ${partner}) → pas de réponse sous ${REQUEST_TIMEOUT_MS}ms (${(err as Error).message})`})
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `POST /api/v1/consent/${recipientFcHash} (partenaire ${partner}) → HTTP ${response.status}: ${text}`})
    }
}

/** Donne le consentement de l'usager aux démarches du partenaire. */
export async function grantDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<void> {
    await setDemarchesConsent(partner, recipientFcHash, true)
}

/** Retire le consentement de l'usager aux démarches du partenaire. */
export async function revokeDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<void> {
    await setDemarchesConsent(partner, recipientFcHash, false)
}
