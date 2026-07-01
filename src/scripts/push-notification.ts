/**
 * Envoie une notification de test sans lancer la suite E2E.
 * Appelé par `just push-notification <login> [titre]`.
 *
 * L'URL backend est dérivée de AMI_ENV (.env.local) :
 *   - contient un nombre  → review app PR  (ex: "1234" → ami-back-staging-pr1234.…)
 *   - sinon               → staging         (ami-back-staging.osc-fr1.scalingo.io)
 *
 * Pré-requis : NOTIF_PARTNER_ID et NOTIF_PARTNER_SECRET dans .env.local.
 */

import { getUser, type FcLogin } from '../helpers/test-users'
import { publishNotification, setBackendUrl } from '../helpers/notifications-api'

const [,, login, title] = process.argv

if (!login) {
  console.error('Usage : just push-notification <login> [titre]')
  console.error('Logins disponibles : voir src/helpers/test-users.local.ts')
  process.exit(1)
}

function resolveBackendUrl(): string {
  const env = process.env.AMI_ENV ?? ''
  const prMatch = env.match(/\b(\d+)\b/)
  if (prMatch) {
    return `https://ami-back-staging-pr${prMatch[1]}.osc-fr1.scalingo.io`
  }
  return 'https://ami-back-staging.osc-fr1.scalingo.io'
}

async function main(): Promise<void> {
  const user = getUser(login as FcLogin)
  const apiUrl = resolveBackendUrl()
  setBackendUrl(apiUrl)

  const notifTitle = title || `Test push — ${new Date().toISOString()}`

  console.log(`→ Environnement : ${process.env.AMI_ENV || 'Staging (défaut)'}`)
  console.log(`→ Backend       : ${apiUrl}`)
  console.log(`→ Destinataire  : ${login} (fc_hash: ${user.fcHash})`)
  console.log(`→ Titre         : "${notifTitle}"`)

  await publishNotification({
    title: notifTitle,
    body: 'Notification de test manuelle — just push-notification',
    recipientFcHash: user.fcHash,
  })

  console.log('✅ Notification envoyée.')
}

main().catch(err => {
  console.error('❌', err instanceof Error ? err.message : err)
  process.exit(1)
})
