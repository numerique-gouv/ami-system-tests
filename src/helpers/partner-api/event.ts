/**
 * Couche basse : PUT /api/v2/event.
 *
 * `EventPayload` est le miroir 1:1 du serializer backend `PartnerEventCreateSerializerV2`
 * (ami-notifications-api, ami/notification/serializers.py). Il est volontairement permissif : les
 * règles du serveur (champs `item_*` « tout ou rien », parent cohérent…) sont portées par les types
 * des fonctions métier de publish.ts. Appeler publishEvent directement permet d'envoyer un payload
 * invalide à dessein, pour tester les réponses 400.
 */
import {AssertionError} from 'node:assert'
import {randomBytes} from 'node:crypto'
import logger from '@wdio/logger'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl} from './client'
import {PARTNER_AMI, checkDemarchesConsent, type PartnerId} from './consent'
import {sentryTraceUrl} from '../reporting/sentry'

const log = logger('api')

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
    /** Unique à chaque appel par défaut : le backend est idempotent (get_or_create sur le payload entier). */
    event_date?: string
    valid_until?: string
    try_push?: boolean
}

export interface PublishEventOptions {
    /** Partenaire émetteur : ses identifiants (client.ts) signent l'appel et c'est son consentement qu'on vérifie ; AMI par défaut. */
    partner?: PartnerId
    /**
     * Vérifie (GET) le consentement du partenaire pour ses événements (son consentement aux démarches) avant le PUT ; true par défaut.
     * Cette garde simule ce que fait un partenaire réel (appelant en production) ; le REFUS est celui du backend : `PUT /api/v2/event`
     * et `POST /api/v1/notifications` passent par la même porte, et un partenaire à consentement activé obtient 404 sans consentement.
     * `false` appelle quand même le PUT (pour vérifier ce refus).
     */
    verifyPartnerConsent?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000

/**
 * Publie un événement via l'API partenaire AMI.
 * Retry automatique sur 5xx (cold-start Scalingo) avec délai de 10s entre chaque tentative.
 * Lance si les variables d'environnement sont manquantes ou si toutes les tentatives échouent.
 */
/** Lien Sentry de la trace de chaque publication, par `content_title` : le titre est ce que le test cherche ensuite dans l'application. */
const publicationTraces = new Map<string, string>()

/** Lien Sentry de la trace de l'envoi de l'événement de titre `title` (la dernière publication portant ce titre), s'il a été publié par ce processus. */
export function publicationSentryUrl(title: string): string | undefined {
    return publicationTraces.get(title)
}

export async function publishEvent(payload: EventPayload, {partner = PARTNER_AMI, verifyPartnerConsent = true}: PublishEventOptions = {}): Promise<void> {
    const apiUrl = getBackendUrl()
    const recipientFcHash = payload.recipient_fc_hash

    log.info(`publishEvent → hôte: ${apiUrl}  fc_hash: ${recipientFcHash}`)

    // Consigne juridique : un partenaire ne communique rien d'un usager sans son consentement.
    if (verifyPartnerConsent) {
        const hasConsent = await checkDemarchesConsent(partner, recipientFcHash)
        if (!hasConsent) {
            const message = `publishEvent → pas de consentement du partenaire ${partner} (démarches) pour fc_hash: ${recipientFcHash}, arrêt sans appeler PUT /api/v2/event`
            log.warn(message)
            throw new AssertionError({message})
        }
    }

    // JSON.stringify omet les champs `undefined` : seules les valeurs définies sont envoyées.
    const body = JSON.stringify({...payload, event_date: payload.event_date ?? new Date().toISOString()})

    // Identifiants lus avant la boucle : des variables manquantes doivent échouer avec leur nom, pas passer pour une absence de réponse.
    // Trace Sentry propre à cette publication : l'en-tête `sentry-trace` (identifiant de trace, identifiant de span, échantillonné) fait CONTINUER
    // cette trace par le backend s'il est instrumenté ; le lien journalisé retrouve alors l'appel dans Sentry (instrumentation du backend non confirmée).
    const traceId = randomBytes(16).toString('hex')
    const headers = {'Content-Type': 'application/json', 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1`, ...authHeaders(partner)}
    const traceUrl = sentryTraceUrl(traceId)
    if (traceUrl) publicationTraces.set(payload.content_title, traceUrl)
    log.info(`publishEvent → trace Sentry de l'appel : ${traceUrl}`)

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
        let response: Response
        try {
            response = await fetch(`${apiUrl}/api/v2/event`, {
                method: 'PUT',
                headers,
                body,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            })
        } catch (err) {
            // Pas de réponse sous REQUEST_TIMEOUT_MS (coupure réseau, cold-start Scalingo) :
            // même traitement qu'un 5xx transitoire, on retente après le délai habituel.
            lastError = new AssertionError({message: `PUT /api/v2/event → pas de réponse sous ${REQUEST_TIMEOUT_MS}ms (${(err as Error).message})`})
            if (attempt < PUBLISH_MAX_RETRIES) {
                await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
            }
            continue
        }

        if (response.ok) return

        const text = await response.text().catch(() => '(corps illisible)')
        lastError = new AssertionError({message: `PUT /api/v2/event (partenaire ${partner}) → HTTP ${response.status}: ${text}`})

        // Pas de retry sur les erreurs 4xx (erreur client, pas transitoire)
        if (response.status < 500) break

        if (attempt < PUBLISH_MAX_RETRIES) {
            await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
        }
    }

    throw lastError!
}

/**
 * Exécute une publication et dit si l'API l'a ACCEPTÉE ou REFUSÉE (HTTP 404 : `User not found` / `Consent not found` / `Consent not given`,
 * rendus par le backend quand le flag `consent_is_enabled` du partenaire est vrai). Toute autre erreur est relancée.
 * Sert aux scénarios « sans consentement » : `verifyPartnerConsent: false` ne fait que sauter la garde côté test, il ne prouve pas que
 * le backend refuse. Constat du 2026-10-26 sur staging : le partenaire AMI (système, consentement non activé) obtient 201 sans consentement ; seul un partenaire à
 * consentement activé (ex. `dinum-dn`) est refusé.
 */
export async function publicationOutcome(publish: () => Promise<void>): Promise<'acceptée' | 'refusée'> {
    try {
        await publish()
        return 'acceptée'
    } catch (err) {
        if (err instanceof Error && /HTTP 404/.test(err.message)) return 'refusée'
        throw err
    }
}
