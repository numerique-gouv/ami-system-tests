import { setupBrowser } from '@testing-library/webdriverio'

/**
 * Retourne les requêtes Testing Library liées au contexte WebView courant.
 * Doit être appelé à l'intérieur d'un callback withWebView() — les requêtes
 * exécutent du JavaScript dans le DOM de la WebView, inutilisables en NATIVE_APP.
 *
 * Usage :
 *   await withWebView(async () => {
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
 * Utilitaire de basculement de contexte Appium WebView.
 *
 * Appium expose deux contextes pour les apps hybrides :
 *   NATIVE_APP  — éléments natifs Android/iOS (UIAutomator2 / XCUITest)
 *   WEBVIEW_*   — contenu web (DOM CSS/XPath, comme dans un navigateur)
 *
 * Les sélecteurs CSS et XPath ne fonctionnent qu'en contexte WEBVIEW_*.
 * Les gestes (swipe, tap sur éléments natifs) fonctionnent en NATIVE_APP.
 *
 * Sur Android, `appium:chromedriverAutodownload: true` est requis dans les capabilities
 * pour que le context switch réussisse (Chromedriver doit correspondre au WebView embarqué).
 */

// 25 s : chaque appel getContexts() prend ~3 s avec webkitResponseTimeout=3000,
// soit ~8 tentatives effectives avant timeout.
const WEBVIEW_WAIT_MS = 25000
const WEBVIEW_POLL_MS = 500

/**
 * Exécute `callback` dans le premier contexte WEBVIEW_* disponible,
 * puis restaure NATIVE_APP. Lance si aucune WebView n'est détectée.
 */
export async function withWebView<T>(callback: () => Promise<T>): Promise<T> {
  const contexts = await waitForWebViewContext()
  const webviewContext = contexts.find((c) => c.startsWith('WEBVIEW_'))
  if (!webviewContext) {
    throw new Error(
      `Aucun contexte WEBVIEW_* trouvé après ${WEBVIEW_WAIT_MS}ms. Contextes disponibles : [${contexts.join(', ')}]. ` +
      'Vérifier appium:chromedriverAutodownload (Android) ou appium:webkitResponseTimeout / isInspectable=true (iOS).'
    )
  }
  await driver.switchContext(webviewContext)
  // iOS/WKWebView : le scriptTimeout se réinitialise à ~0 ms après chaque switch de contexte.
  // Android/Chromedriver : le défaut est 30 000 ms — insuffisant si le timeout passé à
  // findBy* dépasse 30 s (e.g. NOTIF_DELIVERY_TIMEOUT_MS = 40 000 ms).
  // @testing-library/webdriverio utilise executeAsync (pas execute) → toutes les requêtes
  // findBy* sont soumises à ce plafond. On force 60 s sur les deux plateformes.
  await browser.setTimeout({ script: 60000 }).catch(() => {})
  // Après le switch, re-sélectionner le dernier window handle disponible.
  // Pendant le flow OIDC, le tab callback se ferme juste après le redirect ;
  // sans ce step, Chromedriver pointe sur un handle stale ("no such window").
  const handles = await browser.getWindowHandles()
  if (handles.length > 0) {
    await browser.switchToWindow(handles[handles.length - 1])
  }
  try {
    return await callback()
  } finally {
    await driver.switchContext('NATIVE_APP')
  }
}

// Nom accessible du bouton de retour présent en haut à gauche de la plupart des écrans
// WebView atteints par navigation enfant (ex. détail d'une démarche). Partagé par
// goBackUntilVisible plutôt que passé en paramètre : un seul geste de retour pour toute l'app.
const BACK_BUTTON_NAME = 'Retour à la page précédente'

/**
 * Répète un geste retour (clic sur le bouton "Retour à la page précédente" s'il est présent,
 * sinon `browser.back()` natif) jusqu'à ce que `sentinel` confirme l'arrivée sur la page
 * cible, ou jusqu'au timeout. Doit être appelé à l'intérieur d'un withWebView() — comme tl().
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

/**
 * Force le recalcul de l'arbre d'accessibilité WKWebView sur iOS.
 *
 * Symptôme corrigé : après un redirect OIDC (ex. page eIDAS → FCP-LOW), `$(selector)`
 * retourne "not found" alors que la page est visuellement rendue — WKWebView en mode
 * automation interroge un AX tree périmé jusqu'à ce qu'un trigger force la re-sync.
 */
export async function refreshAxTree(): Promise<void> {
  if (!driver.isIOS) return
  // getPageSource() sérialise le DOM courant via WKRDP et invalide le snapshot AX périmé.
  // driver.execute(() => 0) seul est insuffisant — il fait un round-trip WKRDP sans forcer
  // la re-sérialisation de l'arbre d'accessibilité après un redirect de page.
  try { await driver.getPageSource() } catch { /* best-effort */ }
}

/**
 * Geste natif vers le bas pour déclencher le SwipeRefreshLayout Android.
 * Doit être appelé hors withWebView : le geste est intercepté par la WebView
 * si on est en contexte WebView, et n'atteint pas le conteneur natif.
 * Sur iOS, préférer `driver.execute(() => window.location.reload())` en WebView —
 * un `UIRefreshControl` peut bloquer ce geste de swipe.
 */
export async function pullToRefresh(): Promise<void> {
  const { width, height } = await driver.getWindowSize()
  await driver.action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25) })
    .down({ button: 0 })
    .move({ duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65) })
    .up({ button: 0 })
    .perform()
}

/**
 * Attend qu'au moins un contexte WEBVIEW_* soit disponible, avec timeout.
 */
async function waitForWebViewContext(): Promise<string[]> {
  const deadline = Date.now() + WEBVIEW_WAIT_MS
  while (Date.now() < deadline) {
    const contexts = await driver.getContexts() as string[]
    if (contexts.some((c) => c.startsWith('WEBVIEW_'))) return contexts
    await browser.pause(WEBVIEW_POLL_MS)
  }
  return await driver.getContexts() as string[]
}
