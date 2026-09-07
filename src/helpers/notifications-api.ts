/**
 * Client HTTP pour l'API partenaire AMI — publication de notifications push.
 *
 * Variables (.env / .env.local) :
 *   AMI_ENV              — fragment du label picker (titre ou numéro de PR).
 *   NOTIF_PARTNER_ID     — identifiant partenaire
 *   NOTIF_PARTNER_SECRET — secret partenaire (HTTP Basic auth)
 *
 * L'URL backend est définie via setBackendUrl(), appelé par EnvironmentPickerPage.reviewEnvironmentPicker()
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
    checkConsent?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000
const STAGING_BASE_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'

function authHeaders(): {Authorization: string} {
    const partnerId = requireEnv('NOTIF_PARTNER_ID')
    const secret = requireEnv('NOTIF_PARTNER_SECRET')
    const credentials = Buffer.from(`${partnerId}:${secret}`).toString('base64')
    return {Authorization: `Basic ${credentials}`}
}

/**
 * Vérifie le consentement de l'usager auprès d'AMI (GET /api/v1/consent/{fc_hash}).
 * Retourne true si AMI a connaissance d'un consentement actif, false si 404 (absent ou retiré).
 */
export async function checkConsent(recipientFcHash: string): Promise<boolean> {
    const apiUrl = resolveApiUrl()
    const response = await fetch(`${apiUrl}/api/v1/consent/${recipientFcHash}`, {
        headers: {'Content-Type': 'application/json', ...authHeaders()},
    })
    if (response.status === 404) return false
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `GET /api/v1/consent/${recipientFcHash} → HTTP ${response.status}: ${text}`})
    }
    return true
}

/**
 * Communique le consentement (don ou retrait) de l'usager pour le partenaire authentifié
 * (POST /api/v1/consent/{fc_hash}). Appelé une première fois lors de l'authentification
 * dans les scénarios de test — voir authenticate.process.ts.
 */
export async function grantConsent(recipientFcHash: string, granted = true): Promise<void> {
    const apiUrl = resolveApiUrl()
    const response = await fetch(`${apiUrl}/api/v1/consent/${recipientFcHash}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...authHeaders()},
        body: JSON.stringify({consent: granted}),
    })
    if (!response.ok) {
        const text = await response.text().catch(() => '(corps illisible)')
        throw new AssertionError({message: `POST /api/v1/consent/${recipientFcHash} → HTTP ${response.status}: ${text}`})
    }
}

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
                                              tryPush, checkConsent: shouldCheckConsent = true,
                                          }: PublishOptions): Promise<void> {
    const apiUrl = resolveApiUrl()

    log.info(`publishNotification → hôte: ${apiUrl}  fc_hash: ${recipientFcHash}`)

    // L'API d'évènement refuse (HTTP 404) tout appel non précédé d'une vérification de consentement.
    if (shouldCheckConsent) {
        const hasConsent = await checkConsent(recipientFcHash)
        if (!hasConsent) {
            const message = `publishNotification → pas de consentement AMI pour fc_hash: ${recipientFcHash}, arrêt sans appeler PUT /api/v2/event`
            log.warn(message)
            throw new AssertionError({message})
        }
    }

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
                'Content-Type': 'application/json',
                ...authHeaders(),
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
 * Appelé par EnvironmentPickerPage.reviewEnvironmentPicker() dès que l'environnement est sélectionné.
 */
export function setBackendUrl(url: string): void {
    _backendUrl = url
}
export function getBackendUrl(): string {
    return _backendUrl
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
