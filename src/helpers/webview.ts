import { setupBrowser } from '@testing-library/webdriverio'
import { platform } from '../platform'

/**
 * Retourne les requêtes Testing Library liées au contexte contenant le DOM de la SPA.
 * Doit être appelé à l'intérieur d'un callback platform().inWebContext() — les requêtes
 * exécutent du JavaScript dans ce DOM, inutilisables en NATIVE_APP.
 *
 * Usage :
 *   await platform().inWebContext(async () => {
 *     const bell = await tl().findByRole('link', { name: /notifications/i })
 *     await bell.click()
 *   })
 */
export function tl() {
  // Cast nécessaire : @testing-library/webdriverio@3 cible WDIO v7/v8 —
  // les types ChainablePromiseElement ont divergé en v9 sans impact à l'exécution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return setupBrowser(browser as any)
}

/**
 * Décrit l'écran courant pour enrichir les messages d'erreur (ex. échec de navigation) —
 * distingue un écran natif d'une URL de la SPA.
 * Best-effort : ne throw jamais, utilisée dans des contextes déjà en échec.
 */
export async function describeCurrentPage(): Promise<string> {
  if (!await platform().isWebContextAvailable()) {
    return 'écran natif (hors WebView)'
  }
  return await platform().inWebContext(() =>
    driver.execute(() => location.href) as Promise<string>
  )
    .then(href => `WebView : ${href}`)
    .catch(() => 'WebView (URL illisible)')
}

// Nom accessible du bouton de retour présent en haut à gauche de la plupart des écrans
// WebView atteints par navigation enfant (ex. détail d'une démarche). Partagé par
// goBackUntilVisible plutôt que passé en paramètre : un seul geste de retour pour toute l'app.
const BACK_BUTTON_NAME = 'Retour à la page précédente'

/**
 * Répète un geste retour (clic sur le bouton "Retour à la page précédente" s'il est présent,
 * sinon `browser.back()`) jusqu'à ce que `sentinel` confirme l'arrivée sur la page cible, ou
 * jusqu'au timeout. Doit être appelé à l'intérieur d'un platform().inWebContext() — comme tl().
 */
export async function retourJusquATexteVisible(
  sentinel: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 500
): Promise<void> {
  await browser.waitUntil(
    async () => {
      if (await sentinel()) return true
      const backButton = await tl().queryByRole('button', { name: BACK_BUTTON_NAME }).catch(() => null)
      if (backButton) {
        await backButton.click()
      } else {
        await browser.back()
      }
      return false
    },
    {
      timeout: timeoutMs,
      interval: intervalMs,
      timeoutMsg: `Page cible non atteinte après ${timeoutMs}ms (retour répété)`
    }
  )
}
