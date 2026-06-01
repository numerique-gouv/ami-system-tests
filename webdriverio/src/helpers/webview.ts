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

const WEBVIEW_WAIT_MS = 8000
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
      'Vérifier appium:chromedriverAutodownload (Android) ou que la WKWebView est bien chargée (iOS).'
    )
  }
  await driver.switchContext(webviewContext)
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
