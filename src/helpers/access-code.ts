/**
 * Déverrouillage de la webapp de staging : pose du cookie access_key attendu par la SPA, avant
 * toute navigation. Les scénarios mobiles commencent sur le review picker ou une page
 * d'authentification ; en webapp, une navigation vers la page d'accueil permet aux scénarios
 * de commencer aux mêmes endroits que les scénarios mobiles.
 */

import logger from '@wdio/logger'

const log = logger('access-code')

const ACCESS_KEY_COOKIE_NAME = 'access_key'
const ACCESS_KEY_COOKIE_TTL_DAYS = 7

/**
 * Pose directement le cookie access_key plutôt que de répondre au window.prompt() :
 * +layout.ts (mobile-app) ne déclenche le prompt que si ce cookie est absent à son premier
 * chargement — le poser en amont de toute navigation vers la SPA évite le popup entièrement.
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