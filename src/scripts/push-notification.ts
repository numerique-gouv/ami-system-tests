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

import { getUser, type FcLogin } from '../helpers/common/test-users'
import { publishNotification, setBackendUrl } from '../helpers/partner-api'
import { backendUrlFor } from '../helpers/common/environment'

const [,, login, title] = process.argv

if (!login) {
  console.error('Usage : just push-notification <login> [titre]')
  console.error('Logins disponibles : voir src/helpers/common/test-users.ts')
  process.exit(1)
}

async function main(): Promise<void> {
  const user = getUser(login as FcLogin)
  const apiUrl = backendUrlFor(process.env.AMI_ENV ?? '')
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
