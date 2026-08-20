/**
 * Gestion du popup natif window.prompt() demandant un code d'accès au chargement de la
 * webapp (gate de staging côté SPA).
 * Les scénaio mobiles commencent sur un review picker ou une page d'auth.
 * En webapp, une navigation vers la page d'accueil permet aux scenario webapp de commencer aux mêmes endroits que les senario mobiles.
 */

import logger from '@wdio/logger'

const log = logger('access-code')

const ALERT_POLL_TIMEOUT_MS = 10000
const ALERT_POLL_INTERVAL_MS = 250

async function isAlertPresent(): Promise<boolean> {
  return await browser
    .getAlertText()
    .then(() => true)
    .catch(() => false)
}

async function handleAccessCodePrompt(): Promise<void> {
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

function isUnexpectedAlertOpenError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('unexpected alert open')
}

export async function navigateAndHandleAccessCode(path: string): Promise<void> {
  try {
    await browser.url(path)
  } catch (error) {
    if (!isUnexpectedAlertOpenError(error)) {
      throw error
    }
    log.info("Alerte de code d'accès déjà ouverte pendant la navigation — traitement avant nouvelle tentative.")
    await handleAccessCodePrompt()
  }
}