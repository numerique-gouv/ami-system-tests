/**
 * Gestion du popup natif window.prompt() demandant un code d'accès au chargement de la
 * webapp (gate de staging côté SPA).
 * Les scénaio mobiles commencent sur un review picker ou une page d'auth.
 * En webapp, une navigation vers la page d'accueil permet aux scenario webapp de commencer aux mêmes endroits que les senario mobiles.
 */

import logger from '@wdio/logger'

const log = logger('access-code')

const ALERT_POLL_TIMEOUT_MS = 10000
const ALERT_POLL_INTERVAL_MS = 500

async function isAlertPresent(): Promise<boolean> {
  return await browser
    .getAlertText()
    .then(() => true)
    .catch(() => false)
}

export async function handleAccessCodePrompt(): Promise<void> {
  const code = process.env.WEB_APP_ACCESS_KEYS
  if (!code) {
    throw new Error(
      "La webapp affiche un popup window.prompt() demandant un code d'accès, mais " +
      'WEB_APP_ACCESS_KEYS est absent de .env.local (cf. gabarit dans .env).'
    )
  }

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

  await browser.sendAlertText(code)
  await browser.acceptAlert()
  log.info("Popup de code d'accès détecté et renseigné.")
}