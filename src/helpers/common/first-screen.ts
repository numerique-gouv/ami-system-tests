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
