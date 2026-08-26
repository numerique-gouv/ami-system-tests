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
var RETRIES = 10

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
    if (await isAlertPresent() && RETRIES > 0) {
        RETRIES = RETRIES - 1
        await handleAccessCodePrompt()
    }
}

const ACCESS_KEY_COOKIE_NAME = 'access_key'
const ACCESS_KEY_COOKIE_TTL_DAYS = 7

/**
 * Pose directement le cookie access_key plutôt que de répondre au window.prompt() (cf.
 * handleAccessCodePrompt ci-dessus, que cette fonction remplace) : +layout.ts (mobile-app)
 * ne déclenche le prompt que si ce cookie est absent à son premier chargement — le poser en
 * amont de toute navigation vers la SPA évite le popup entièrement.
 */
export async function handleAccessKeyCookie(webappUrl: string): Promise<void> {
    const key = process.env.WEB_APP_ACCESS_KEYS
    if (!key) {
        throw new Error(
            "La webapp attend un cookie access_key valide, mais WEB_APP_ACCESS_KEYS est absent " +
            'de .env.local (cf. gabarit dans .env).'
        )
    }

    // Amorce l'origine sur une ressource statique (favicon) plutôt que la page d'accueil : une
    // navigation vers la racine exécute +layout.ts, qui lance le prompt dès que ce cookie est
    // absent — le favicon est servi tel quel, sans passer par ce hook SvelteKit.
    await browser.url(new URL('favicon.ico', webappUrl).toString())

    await browser.setCookies({
        name: ACCESS_KEY_COOKIE_NAME,
        value: key,
        expiry: Math.floor(Date.now() / 1000) + ACCESS_KEY_COOKIE_TTL_DAYS * 24 * 60 * 60,
    })
    log.info('Cookie access_key posé avant navigation vers la SPA.')
}