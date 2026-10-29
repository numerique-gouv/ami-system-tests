import {AssertionError} from 'node:assert'
import {backendUrlFor} from '../common/environment'

/** Sans délai, un fetch sur une connexion coupée reste pendu jusqu'au timeout Mocha. */
export const REQUEST_TIMEOUT_MS = 15000

/** Par défaut dérivée d'AMI_ENV : les builds préprod n'ont pas de sélecteur d'environnement. */
let backendUrl: string = backendUrlFor(process.env.AMI_ENV ?? '')

export function setBackendUrl(url: string): void {
    backendUrl = url
}

export function getBackendUrl(): string {
    return backendUrl
}

/** Partenaire système : ses identifiants sont NOTIF_PARTNER_ID / NOTIF_PARTNER_SECRET, ceux des autres NOTIF_PARTNER_<SLUG>_ID / _SECRET. */
const AMI_PARTNER = 'dinum-ami'

function partnerCredentialVariables(partner: string): {id: string; secret: string} {
    if (partner === AMI_PARTNER) return {id: 'NOTIF_PARTNER_ID', secret: 'NOTIF_PARTNER_SECRET'}
    const slug = partner.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    return {id: `NOTIF_PARTNER_${slug}_ID`, secret: `NOTIF_PARTNER_${slug}_SECRET`}
}

export function hasPartnerCredentials(partner: string = AMI_PARTNER): boolean {
    const vars = partnerCredentialVariables(partner)
    return Boolean(process.env[vars.id]) && Boolean(process.env[vars.secret])
}

function requireEnv(name: string): string {
    const val = process.env[name]
    if (!val) throw new Error(`Variable d'environnement manquante : ${name}`)
    return val
}

export function authHeaders(partner: string = AMI_PARTNER): {Authorization: string} {
    const vars = partnerCredentialVariables(partner)
    const credentials = Buffer.from(`${requireEnv(vars.id)}:${requireEnv(vars.secret)}`).toString('base64')
    return {Authorization: `Basic ${credentials}`}
}

/** Réponse HTTP que l'API ne devait pas renvoyer : c'est un échec du test, pas de l'environnement. */
export async function unexpectedResponse(request: string, response: Response): Promise<AssertionError> {
    return new AssertionError({message: `${request} → HTTP ${response.status}: ${await response.text()}`})
}
