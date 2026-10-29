/** La dernière WebView visible (`visibilities` est parallèle à `webviews`), à défaut la dernière de la liste. */
export function lastVisible<T>(webviews: readonly T[], visibilities: readonly boolean[]): T | undefined {
  for (let i = webviews.length - 1; i >= 0; i--) if (visibilities[i]) return webviews[i]
  return webviews[webviews.length - 1]
}

/** Une seule WebView visible : la lecture est stable. */
export const isUnambiguous = (visibilities: readonly boolean[]): boolean => visibilities.filter(Boolean).length === 1
