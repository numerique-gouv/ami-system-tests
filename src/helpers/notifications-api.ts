/**
 * Client HTTP pour l'API partenaire AMI — publication de notifications push.
 *
 * Variables requises (.env) :
 *   NOTIF_API_URL            — URL de base du backend AMI (sans slash final)
 *   NOTIF_PARTNER_ID         — identifiant partenaire
 *   NOTIF_PARTNER_SECRET     — secret partenaire (HTTP Basic auth)
 *   NOTIF_RECIPIENT_FC_HASH  — hash FC déterministe du compte sandbox
 */

type ItemGenericStatus = 'new' | 'wip' | 'closed'

interface PublishOptions {
  // Champs requis
  title: string
  body: string
  recipientFcHash: string
  // Champs optionnels — seules les valeurs définies sont envoyées
  privateBody?: string
  icon?: string
  itemType?: string
  itemId?: string
  itemStatusLabel?: string
  itemGenericStatus?: ItemGenericStatus
  itemCanal?: string
  itemMilestoneStartDate?: string
  itemMilestoneEndDate?: string
  itemExternalUrl?: string
  tryPush?: boolean
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000

/**
 * Publie une notification via l'API partenaire AMI.
 * Retry automatique sur 5xx (cold-start Scalingo) avec délai de 10s entre chaque tentative.
 * Lance si les variables d'environnement sont manquantes ou si toutes les tentatives échouent.
 */
export async function publishNotification({
  title, body, recipientFcHash,
  privateBody, icon,
  itemType, itemId, itemStatusLabel, itemGenericStatus, itemCanal,
  itemMilestoneStartDate, itemMilestoneEndDate, itemExternalUrl,
  tryPush,
}: PublishOptions): Promise<void> {
  const apiUrl    = requireEnv('NOTIF_API_URL')
  const partnerId = requireEnv('NOTIF_PARTNER_ID')
  const secret    = requireEnv('NOTIF_PARTNER_SECRET')

  const credentials = Buffer.from(`${partnerId}:${secret}`).toString('base64')

  const payload = {
    recipient_fc_hash: recipientFcHash,
    content_title:     title,
    content_body:      body,
    // send_date unique à chaque appel : contourne l'idempotence backend (get_or_create sur le payload entier)
    send_date:         new Date().toISOString(),
    ...(privateBody          !== undefined && { content_private_body:    privateBody }),
    ...(icon                 !== undefined && { content_icon:            icon }),
    ...(itemType             !== undefined && { item_type:               itemType }),
    ...(itemId               !== undefined && { item_id:                 itemId }),
    ...(itemStatusLabel      !== undefined && { item_status_label:       itemStatusLabel }),
    ...(itemGenericStatus    !== undefined && { item_generic_status:     itemGenericStatus }),
    ...(itemCanal            !== undefined && { item_canal:              itemCanal }),
    ...(itemMilestoneStartDate !== undefined && { item_milestone_start_date: itemMilestoneStartDate }),
    ...(itemMilestoneEndDate   !== undefined && { item_milestone_end_date:   itemMilestoneEndDate }),
    ...(itemExternalUrl      !== undefined && { item_external_url:       itemExternalUrl }),
    ...(tryPush              !== undefined && { try_push:                tryPush }),
  }

  let lastError: Error | undefined
  for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
    const response = await fetch(`${apiUrl}/api/v1/notifications`, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok || response.status === 201) return

    const text = await response.text().catch(() => '(corps illisible)')
    lastError = new Error(`POST /api/v1/notifications → HTTP ${response.status}: ${text}`)

    // Pas de retry sur les erreurs 4xx (erreur client, pas transitoire)
    if (response.status < 500) break

    if (attempt < PUBLISH_MAX_RETRIES) {
      await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
    }
  }

  throw lastError!
}

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) {
    throw new Error(
      `Variable d'environnement manquante : ${name}. ` +
      'Copier maestro/.env.example en maestro/.env et renseigner les valeurs.'
    )
  }
  return val
}
