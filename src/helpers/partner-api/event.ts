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
import logger from '@wdio/logger'
import {REQUEST_TIMEOUT_MS, authHeaders, getBackendUrl} from './client'
import {checkConsent} from './consent'

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
    /** Vérifie le consentement (GET) avant le PUT ; true par défaut. */
    checkConsent?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000

/**
 * Publie un événement via l'API partenaire AMI.
 * Retry automatique sur 5xx (cold-start Scalingo) avec délai de 10s entre chaque tentative.
 * Lance si les variables d'environnement sont manquantes ou si toutes les tentatives échouent.
 */
export async function publishEvent(payload: EventPayload, {checkConsent: shouldCheckConsent = true}: PublishEventOptions = {}): Promise<void> {
    const apiUrl = getBackendUrl()
    const recipientFcHash = payload.recipient_fc_hash

    log.info(`publishEvent → hôte: ${apiUrl}  fc_hash: ${recipientFcHash}`)

    // Consigne juridique : un partenaire ne communique rien d'un usager sans son consentement.
    if (shouldCheckConsent) {
        const hasConsent = await checkConsent(recipientFcHash)
        if (!hasConsent) {
            const message = `publishEvent → pas de consentement AMI pour fc_hash: ${recipientFcHash}, arrêt sans appeler PUT /api/v2/event`
            log.warn(message)
            throw new AssertionError({message})
        }
    }

    // JSON.stringify omet les champs `undefined` : seules les valeurs définies sont envoyées.
    const body = JSON.stringify({...payload, event_date: payload.event_date ?? new Date().toISOString()})

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
        let response: Response
        try {
            response = await fetch(`${apiUrl}/api/v2/event`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json', ...authHeaders()},
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
        lastError = new AssertionError({message: `PUT /api/v2/event → HTTP ${response.status}: ${text}`})

        // Pas de retry sur les erreurs 4xx (erreur client, pas transitoire)
        if (response.status < 500) break

        if (attempt < PUBLISH_MAX_RETRIES) {
            await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
        }
    }

    throw lastError!
}
