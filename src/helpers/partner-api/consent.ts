import logger from '@wdio/logger'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl, hasPartnerCredentials, unexpectedResponse} from './client'

const log = logger('api')

/** Identifiant d'un partenaire, tel qu'il nomme la case de Préférences > Suivi des démarches. */
export type PartnerId = string

/** Partenaire système : le backend ignore son consentement. */
export const PARTNER_AMI: PartnerId = 'dinum-ami'
/** Démarche Numérique : partenaire à consentement activé côté backend. */
export const PARTNER_DN: PartnerId = 'dinum-dn'

/** Consentement de l'usager aux démarches d'un partenaire. Les notifications push, réglage global de l'app, n'ont pas d'API. */
async function consentRequest(partner: PartnerId, recipientFcHash: string, init: RequestInit = {}): Promise<Response> {
    return await fetch(`${getBackendUrl()}/api/v1/consent/${recipientFcHash}`, {
        ...init,
        headers: {'Content-Type': 'application/json', ...authHeaders(partner)},
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
}

/** `true` si le consentement est actif, `false` si le backend répond 404 (absent ou retiré). */
export async function checkDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<boolean> {
    const response = await consentRequest(partner, recipientFcHash)
    if (response.status === 404) return false
    if (!response.ok) throw await unexpectedResponse(`GET /api/v1/consent/${recipientFcHash}`, response)
    return true
}

async function setDemarchesConsent(partner: PartnerId, recipientFcHash: string, granted: boolean): Promise<void> {
    const response = await consentRequest(partner, recipientFcHash, {method: 'POST', body: JSON.stringify({consent: granted})})
    if (!response.ok) throw await unexpectedResponse(`POST /api/v1/consent/${recipientFcHash}`, response)
}

export async function grantDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<void> {
    await setDemarchesConsent(partner, recipientFcHash, true)
}

export async function revokeDemarchesConsent(partner: PartnerId, recipientFcHash: string): Promise<void> {
    await setDemarchesConsent(partner, recipientFcHash, false)
}

/** À appeler au début d'un `it` (fonction `function`, pas flèche) : `skipUnlessPartnerCredentials(this, PARTNER_DN)`. */
export function skipUnlessPartnerCredentials(mochaContext: Mocha.Context, partner: PartnerId): void {
    if (hasPartnerCredentials(partner)) return
    log.warn(`Identifiants du partenaire ${partner} absents, test sauté`)
    mochaContext.skip()
}
