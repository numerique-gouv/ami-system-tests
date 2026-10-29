import {AssertionError} from 'node:assert'
import {randomBytes} from 'node:crypto'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl, unexpectedResponse} from './client'
import {PARTNER_AMI, checkDemarchesConsent, type PartnerId} from './consent'
import {sentryTraceUrl} from '../reporting/sentry'

export type GenericStatus = 'new' | 'wip' | 'closed'

export interface EventPayload {
    recipient_fc_hash: string
    content_title: string
    content_body: string
    content_private_body?: string
    content_subheading?: string
    content_icon?: string
    content_link?: string
    item_type?: string
    item_id?: string
    item_status_label?: string
    item_generic_status?: GenericStatus
    item_canal?: string
    item_milestone_start_date?: string
    item_milestone_end_date?: string
    item_parent_partner_id?: string
    item_parent_type?: string
    item_parent_id?: string
    /** Par défaut l'instant de l'appel : le backend est idempotent sur le payload entier. */
    event_date?: string
    valid_until?: string
    try_push?: boolean
}

export interface PublishEventOptions {
    /** Partenaire émetteur : ses identifiants signent l'appel et c'est son consentement qu'on vérifie. */
    partner?: PartnerId
    /** Vérifie le consentement du partenaire avant le PUT, comme un partenaire réel. `false` envoie quand même le PUT, pour vérifier le refus du backend. */
    verifyPartnerConsent?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000

/** Lien Sentry de la trace de chaque publication, par `content_title` : le titre est ce que le test cherche ensuite dans l'application. */
const publicationTraces = new Map<string, string>()

export function publicationSentryUrl(title: string): string | undefined {
    return publicationTraces.get(title)
}

/** Reprend sur 5xx et sans réponse (cold-start Scalingo), pas sur 4xx. Lève la dernière erreur si toutes les tentatives échouent. */
export async function publishEvent(payload: EventPayload, {partner = PARTNER_AMI, verifyPartnerConsent = true}: PublishEventOptions = {}): Promise<void> {
    if (verifyPartnerConsent && !await checkDemarchesConsent(partner, payload.recipient_fc_hash)) {
        throw new AssertionError({message: `Pas de consentement du partenaire ${partner} pour ${payload.recipient_fc_hash}, PUT /api/v2/event non appelé`})
    }

    const body = JSON.stringify({...payload, event_date: payload.event_date ?? new Date().toISOString()})
    const traceId = randomBytes(16).toString('hex')
    const headers = {'Content-Type': 'application/json', 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1`, ...authHeaders(partner)}
    const traceUrl = sentryTraceUrl(traceId)
    if (traceUrl) publicationTraces.set(payload.content_title, traceUrl)

    let lastError: unknown
    for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
        if (attempt > 1) await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
        try {
            const response = await fetch(`${getBackendUrl()}/api/v2/event`, {method: 'PUT', headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)})
            if (response.ok) return
            lastError = await unexpectedResponse('PUT /api/v2/event', response)
            if (response.status < 500) break
        } catch (err) {
            lastError = err
        }
    }
    throw lastError
}

/** `refusée` quand le backend répond 404 (`User not found`, `Consent not found`, `Consent not given`), `acceptée` sinon ; toute autre erreur est relancée. */
export async function publicationOutcome(publish: () => Promise<void>): Promise<'acceptée' | 'refusée'> {
    try {
        await publish()
        return 'acceptée'
    } catch (err) {
        if (err instanceof Error && /HTTP 404/.test(err.message)) return 'refusée'
        throw err
    }
}
