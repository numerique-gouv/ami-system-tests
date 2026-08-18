/**
 * Gestion du popup natif window.prompt() demandant un code d'accès au chargement de la
 * webapp (gate de staging côté SPA, distinct du Basic Auth backend — cf. NOTIF_PARTNER_SECRET
 * dans src/helpers/notifications-api.ts). Géré via l'API WebDriver dédiée aux dialogues JS
 * (getAlertText/sendAlertText/acceptAlert) plutôt que via un sélecteur DOM : un window.prompt()
 * n'est pas dans le DOM, il bloque le thread JS de la page tant qu'il n'est pas résolu.
 */

import logger from '@wdio/logger'

const log = logger('access-code')

const ALERT_POLL_TIMEOUT_MS = 5000
const ALERT_POLL_INTERVAL_MS = 250

async function isAlertPresent(): Promise<boolean> {
  return await browser
    .getAlertText()
    .then(() => true)
    .catch(() => false)
}

/**
 * À appeler juste après la navigation initiale (browser.url('/')) dans le before() de
 * wdio.webapp.conf.ts. N'échoue pas silencieusement si WEBAPP_ACCESS_CODE est absent alors
 * qu'un prompt apparaît : mieux vaut une erreur explicite ici qu'un test qui échoue plus loin
 * sur un premier sélecteur introuvable, sans lien apparent avec la vraie cause.
 */
export async function handleAccessCodePrompt(): Promise<void> {
  const present = await browser
    .waitUntil(() => isAlertPresent(), {
      timeout: ALERT_POLL_TIMEOUT_MS,
      interval: ALERT_POLL_INTERVAL_MS,
    })
    .catch(() => false)

  if (!present) {
    log.info("Aucun popup de code d'accès détecté — environnement déjà déverrouillé, ou variante sans popup.")
    return
  }

  const code = process.env.WEB_APP_ACCESS_KEYS
  if (!code) {
    throw new Error(
      "La webapp affiche un popup window.prompt() demandant un code d'accès, mais " +
      'WEB_APP_ACCESS_KEYS est absent de .env.local (cf. gabarit dans .env).'
    )
  }

  await browser.sendAlertText(code)
  await browser.acceptAlert()
  log.info("Popup de code d'accès détecté et renseigné.")
}