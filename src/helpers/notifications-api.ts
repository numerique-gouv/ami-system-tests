/**
 * Client HTTP pour l'API partenaire AMI — publication de notifications push.
 *
 * Portage TypeScript de maestro/scripts/notification-publish.js.
 * Les variables d'environnement sont chargées depuis maestro/.env via wdio.base.conf.ts.
 *
 * Variables requises (maestro/.env) :
 *   NOTIF_API_URL            — URL de base du backend AMI (sans slash final)
 *   NOTIF_PARTNER_ID         — identifiant partenaire
 *   NOTIF_PARTNER_SECRET     — secret partenaire (HTTP Basic auth)
 *   NOTIF_RECIPIENT_FC_HASH  — hash FC déterministe du compte sandbox
 */

interface PublishOptions {
  title: string
  body: string
}

const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000

/**
 * Publie une notification via l'API partenaire AMI.
 * Retry automatique sur 5xx (cold-start Scalingo) avec délai de 10s entre chaque tentative.
 * Lance si les variables d'environnement sont manquantes ou si toutes les tentatives échouent.
 */
export async function publishNotification({ title, body }: PublishOptions): Promise<void> {
  const apiUrl    = requireEnv('NOTIF_API_URL')
  const partnerId = requireEnv('NOTIF_PARTNER_ID')
  const secret    = requireEnv('NOTIF_PARTNER_SECRET')
  const fcHash    = requireEnv('NOTIF_RECIPIENT_FC_HASH')

  const credentials = Buffer.from(`${partnerId}:${secret}`).toString('base64')

  const payload = {
    recipient_fc_hash: fcHash,
    content_title:     title,
    content_body:      body,
    // send_date unique à chaque appel : contourne l'idempotence backend (get_or_create sur le payload entier)
    send_date:         new Date().toISOString(),
    try_push:          true,
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
