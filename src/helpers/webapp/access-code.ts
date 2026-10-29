const ACCESS_KEY_COOKIE_NAME = 'access_key'
const ACCESS_KEY_COOKIE_TTL_DAYS = 7

/** Pose le cookie access_key avant toute navigation vers la SPA : sans lui, son layout ouvre un `window.prompt()`. */
export async function handleAccessKeyCookie(webappUrl: string): Promise<void> {
    const key = process.env.WEB_APP_ACCESS_KEYS
    if (!key) throw new Error('WEB_APP_ACCESS_KEYS absent de .env')

    // Le favicon est servi sans passer par le layout de la SPA, donc sans déclencher le prompt.
    await browser.url(new URL('favicon.ico', webappUrl).toString())

    await browser.setCookies({
        name: ACCESS_KEY_COOKIE_NAME,
        value: key,
        expiry: Math.floor(Date.now() / 1000) + ACCESS_KEY_COOKIE_TTL_DAYS * 24 * 60 * 60,
    })
}
