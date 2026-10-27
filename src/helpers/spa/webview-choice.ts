/**
 * Choix de la WebView « vue » parmi plusieurs (logique pure, sans Appium : testée par `webview-choice.test.ts`).
 * Utilisée par `lastVisibleWebView` (src/platform/appium.adapter.ts), sur iOS comme sur Android.
 */

/**
 * La dernière WebView de `webviews` dont `visibilities[i]` est vrai (la plus récente des visibles) ; à défaut de visible, la dernière
 * de la liste ; `undefined` si la liste est vide. `visibilities` est parallèle à `webviews`.
 */
export function lastVisible<T>(webviews: readonly T[], visibilities: readonly boolean[]): T | undefined {
  for (let i = webviews.length - 1; i >= 0; i--) if (visibilities[i]) return webviews[i]
  return webviews[webviews.length - 1]
}

/** Vrai si exactement une WebView est visible : la lecture est alors stable (sinon l'app revient d'arrière-plan ou ouvre une page). */
export const isUnambiguous = (visibilities: readonly boolean[]): boolean => visibilities.filter(Boolean).length === 1
