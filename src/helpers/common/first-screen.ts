/**
 * Logique pure de l'attente du PREMIER écran après la connexion FranceConnect (testée dans first-screen.test.ts).
 * Le tour de boucle de `reachHome` (src/pages/authenticate.process.ts) y fait appel ; aucun accès au navigateur ici.
 */

/** Route de retour de FranceConnect : tant que l'URL y est, l'app charge (geo.api.gouv.fr, session) avant d'afficher un écran. */
const LOGIN_CALLBACK_ROUTE = /login-callback/

export function isLoginCallbackUrl(url: string): boolean {
  return LOGIN_CALLBACK_ROUTE.test(url)
}

export const HOME = 'accueil'

/** Premier écran visible parmi ceux sondés, dans l'ordre de priorité fourni (accueil d'abord) ; `null` si aucun. */
export function pickFirstScreen<T extends {name: string}>(probed: Array<{screen: T, shown: boolean}>): T | null {
  return probed.find(p => p.shown)?.screen ?? null
}

/** Raison d'échec explicite : quels écrans étaient attendus, où l'on est, après combien de temps. */
export function describeFirstScreenTimeout(expected: string[], url: string, waitedMs: number): string {
  return `aucun des écrans attendus (${expected.join(', ')}) n'est apparu en ${Math.round(waitedMs / 1000)}s, URL courante : ${url}`
}

/**
 * `url` est-elle une page du backend HORS de la SPA ? La SPA est servie à la racine (`/`, ses routes sont dans le `#`) : un autre chemin du
 * même backend est une page serveur (ex. la cible d'un lien de démarche, `/demarches/<id>/v2`, qui répond 404 sur staging), de même que la page intermédiaire du SSO
 * qui y mène (`/?login_redirect_url=<cible>#/login-callback`, restée sans redirection sur iOS). Une autre origine
 * n'est pas jugée ici : ce peut être FranceConnect, dont les écrans font partie de la connexion.
 */
export function isBackendPageOutsideSpa(url: string, backendUrl: string): boolean {
  try {
    const page = new URL(url)
    return page.origin === new URL(backendUrl).origin && (page.pathname !== '/' || page.searchParams.has('login_redirect_url'))
  } catch {
    return false
  }
}
