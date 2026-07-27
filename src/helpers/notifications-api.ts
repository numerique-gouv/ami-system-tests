/**
 * Client HTTP pour l'API partenaire AMI — publication de notifications push.
 *
 * Variables (.env / .env.local) :
 *   AMI_ENV              — fragment du label picker (titre ou numéro de PR).
 *   NOTIF_PARTNER_ID     — identifiant partenaire
 *   NOTIF_PARTNER_SECRET — secret partenaire (HTTP Basic auth)
 *
 * L'URL backend est définie via setBackendUrl(), appelé par LoginPage.reviewEnvironmentPicker()
 * depuis le titre de l'item cliqué dans le picker — jamais par variable d'environnement.
 */
import {AssertionError} from "node:assert";
import logger from "@wdio/logger";

const log = logger('api')

type ItemGenericStatus = 'new' | 'wip' | 'closed'

interface PublishOptions {
    // Champs requis
    title: string
    body: string
    recipientFcHash: string
    // Champs optionnels — seules les valeurs définies sont envoyées
    privateBody?: string
    icon?: string
    contentLink?: string
    itemType?: string
    itemId?: string
    itemParentPartnerId?: string
    itemParentType?: string
    itemParentId?: string
    itemStatusLabel?: string
    itemGenericStatus?: ItemGenericStatus
    itemCanal?: string
    itemMilestoneStartDate?: string
    itemMilestoneEndDate?: string
    eventDate?: string
    validUntil?: string
    tryPush?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000
const STAGING_BASE_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'

/**
 * Publie une notification via l'API partenaire AMI.
 * Retry automatique sur 5xx (cold-start Scalingo) avec délai de 10s entre chaque tentative.
 * Lance si les variables d'environnement sont manquantes ou si toutes les tentatives échouent.
 */
export async function publishNotification({
                                              title, body, recipientFcHash,
                                              privateBody, icon, contentLink,
                                              itemType, itemId, itemParentPartnerId, itemParentType, itemParentId, itemStatusLabel, itemGenericStatus, itemCanal,
                                              itemMilestoneStartDate, itemMilestoneEndDate, eventDate, validUntil,
                                              tryPush,
                                          }: PublishOptions): Promise<void> {
    const apiUrl = resolveApiUrl()
    const partnerId = requireEnv('NOTIF_PARTNER_ID')
    const secret = requireEnv('NOTIF_PARTNER_SECRET')

    log.info(`publishNotification → hôte: ${apiUrl}  partner: ${partnerId}  fc_hash: ${recipientFcHash}`)

    const credentials = Buffer.from(`${partnerId}:${secret}`).toString('base64')

    const payload = {
        recipient_fc_hash: recipientFcHash,
        content_title: title,
        content_body: body,
        ...(privateBody !== undefined && {content_private_body: privateBody}),
        ...(icon !== undefined && {content_icon: icon}),
        ...(contentLink !== undefined && {content_link: contentLink}),
        ...(itemType !== undefined && {item_type: itemType}),
        ...(itemId !== undefined && {item_id: itemId}),
        ...(itemParentPartnerId !== undefined && {item_parent_partner_id: itemParentPartnerId}),
        ...(itemParentType !== undefined && {item_parent_type: itemParentType}),
        ...(itemParentId !== undefined && {item_parent_id: itemParentId}),
        ...(itemStatusLabel !== undefined && {item_status_label: itemStatusLabel}),
        ...(itemGenericStatus !== undefined && {item_generic_status: itemGenericStatus}),
        ...(itemCanal !== undefined && {item_canal: itemCanal}),
        ...(itemMilestoneStartDate !== undefined && {item_milestone_start_date: itemMilestoneStartDate}),
        ...(itemMilestoneEndDate !== undefined && {item_milestone_end_date: itemMilestoneEndDate}),
        // event_date unique à chaque appel : contourne l'idempotence backend (get_or_create sur le payload entier)
        ...(eventDate !== undefined && {event_date: eventDate} || { event_date: new Date().toISOString()}),
        ...(validUntil !== undefined && {valid_until: validUntil}),
        ...(tryPush !== undefined && {try_push: tryPush}),
    }

    let lastError: Error | undefined
    for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
        const response = await fetch(`${apiUrl}/api/v2/event`, {
            method: 'PUT',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (response.ok || response.status === 201) return

        const text = await response.text().catch(() => '(corps illisible)')
        lastError = new AssertionError({ message: `PUT /api/v2/event → HTTP ${response.status}: ${text}` })

        // Pas de retry sur les erreurs 4xx (erreur client, pas transitoire)
        if (response.status < 500) break

        if (attempt < PUBLISH_MAX_RETRIES) {
            await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
        }
    }

    throw lastError!
}

// URL du backend pour la session courante — fixée par setBackendUrl() lors du choix de l'env.
let _backendUrl: string = STAGING_BASE_URL

/**
 * Définit l'URL backend pour toute la session de test.
 * Appelé par LoginPage.reviewEnvironmentPicker() dès que l'environnement est sélectionné.
 */
export function setBackendUrl(url: string): void {
    _backendUrl = url
}

function resolveApiUrl(): string {
    return _backendUrl
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
