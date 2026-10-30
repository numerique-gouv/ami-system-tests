export const HOME = 'accueil'

/** Route de retour de FranceConnect : tant que l'URL y est, l'app charge avant d'afficher un écran. */
const LOGIN_CALLBACK_ROUTE = /login-callback/

export function isLoginCallbackUrl(url: string): boolean {
  return LOGIN_CALLBACK_ROUTE.test(url)
}

/**
 * La SPA est servie à la racine (ses routes sont dans le `#`) : un autre chemin du même backend, ou la page
 * intermédiaire du SSO (`login_redirect_url`), est une page serveur. Une autre origine n'est pas jugée (FranceConnect).
 */
export function isBackendPageOutsideSpa(url: string, backendUrl: string): boolean {
  try {
    const page = new URL(url)
    return page.origin === new URL(backendUrl).origin && (page.pathname !== '/' || page.searchParams.has('login_redirect_url'))
  } catch {
    return false
  }
}
