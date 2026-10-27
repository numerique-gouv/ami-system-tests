import logger from '@wdio/logger'

const log = logger('helper')

/**
 * Constat par l'arbre d'accessibilité NATIF (iOS), jamais par le débogueur WebKit.
 *
 * Pourquoi : un clic qui change de document (redirection FranceConnect, fin de session) détruit la target WebKit de la page. Une commande
 * WebView envoyée à cette target quelques ms avant sa destruction ne reçoit jamais de réponse (atome expiré à 120 s ; cf. rapport
 * `webkit`, mécanismes (a) et (c)). XCUITest lit le même contenu sans passer par le débogueur : on constate donc la DISPARITION de la page
 * quittée (puis l'apparition de la suivante) par là, avant toute commande WebView. À appeler HORS `inWebContext` (les locators
 * `-ios predicate string:` ne s'exécutent qu'en contexte NATIVE_APP).
 *
 * Délais mesurés le 2026-10-27 (simulateur chargé) : bouton FranceConnect disparu 0,8 s après le clic, lien eIDAS présent 1,0 s après,
 * champs d'identifiants présents 1,3 s après le clic eIDAS, formulaire disparu 2,9 s après la validation.
 * Hors iOS : sans effet (Android, webapp : pas de course de targets WebKit).
 * N'échoue jamais : un arbre natif périmé ne doit pas casser le test, la suite ré-observe la page elle-même ; le dépassement est journalisé.
 */
export async function waitForNativeAx(selector: string, state: 'present' | 'gone', what: string, timeout = 8000): Promise<boolean> {
  if (!driver.isIOS) return true
  const startedAt = Date.now()
  const reached = await browser.waitUntil(async () => ((await $$(selector)).length > 0) === (state === 'present'), {timeout, interval: 250})
    .then(() => true, () => false)
  if (reached) log.info(`${what} : ${state === 'gone' ? 'disparu' : 'présent'} (arbre natif) après ${Date.now() - startedAt}ms`)
  else log.warn(`${what} : toujours ${state === 'gone' ? 'présent' : 'absent'} dans l'arbre natif après ${timeout}ms (arbre périmé ? on poursuit)`)
  return reached
}
