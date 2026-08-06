import type { PlatformAdapter } from './types'

/**
 * Implémentation mobile (Android/iOS) de PlatformAdapter — logique historiquement
 * dans src/helpers/webview.ts, déplacée ici pour isoler tous les appels Appium
 * (`driver.switchContext`, `driver.getContexts`, gestes natifs) derrière l'interface
 * commune. Voir CLAUDE.md §Architecture et docs/adr/2026-07-09-…
 */

// 25 s : chaque appel getContexts() prend ~3 s avec webkitResponseTimeout=3000,
// soit ~8 tentatives effectives avant timeout.
const WEBVIEW_WAIT_MS = 25000
const WEBVIEW_POLL_MS = 500

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

/**
 * Exécute `callback` dans le premier contexte WEBVIEW_* disponible,
 * puis restaure NATIVE_APP. Lance si aucune WebView n'est détectée.
 *
 * Appium expose deux contextes pour les apps hybrides :
 *   NATIVE_APP  — éléments natifs Android/iOS (UIAutomator2 / XCUITest)
 *   WEBVIEW_*   — contenu web (DOM CSS/XPath, comme dans un navigateur)
 *
 * Sur Android, `appium:chromedriverAutodownload: true` est requis dans les capabilities
 * pour que le context switch réussisse (Chromedriver doit correspondre au WebView embarqué).
 */
async function inWebContext<T>(callback: () => Promise<T>): Promise<T> {
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
  // Android/Chromedriver : le défaut est 30 000 ms.
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

async function isWebContextAvailable(): Promise<boolean> {
  const contexts = await driver.getContexts() as string[]
  return contexts.some((c) => c.startsWith('WEBVIEW_'))
}

/**
 * Force le recalcul de l'arbre d'accessibilité WKWebView sur iOS.
 *
 * Symptôme corrigé : après un redirect OIDC (ex. page eIDAS → FCP-LOW), `$(selector)`
 * retourne "not found" alors que la page est visuellement rendue — WKWebView en mode
 * automation interroge un AX tree périmé jusqu'à ce qu'un trigger force la re-sync.
 */
async function refreshAxTree(): Promise<void> {
  if (!driver.isIOS) return
  // getPageSource() sérialise le DOM courant via WKRDP et invalide le snapshot AX périmé.
  // driver.execute(() => 0) seul est insuffisant — il fait un round-trip WKRDP sans forcer
  // la re-sérialisation de l'arbre d'accessibilité après un redirect de page.
  try { await driver.getPageSource() } catch { /* best-effort */ }
}

/**
 * Geste natif vers le bas pour déclencher le SwipeRefreshLayout Android.
 * Doit être appelé hors inWebContext : le geste est intercepté par la WebView
 * si on est en contexte WebView, et n'atteint pas le conteneur natif.
 * Sur iOS, préférer `driver.execute(() => window.location.reload())` en WebView —
 * un `UIRefreshControl` peut bloquer ce geste de swipe.
 */
async function pullToRefresh(): Promise<void> {
  const { width, height } = await driver.getWindowSize()
  await driver.action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25) })
    .down({ button: 0 })
    .move({ duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65) })
    .up({ button: 0 })
    .perform()
}

export const appiumAdapter: PlatformAdapter = {
  get kind() {
    return driver.isIOS ? 'ios' : 'android'
  },
  get fcButtonIsNative() {
    return !driver.isIOS
  },
  inWebContext,
  isWebContextAvailable,
  refreshAxTree,
  pullToRefresh,
}
