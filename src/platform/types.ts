export type PlatformKind = 'android' | 'ios' | 'webapp'

/**
 * Isole les points de couplage Appium/mobile identifiés lors de l'exploration
 * (docs/adr/2026-07-09-Strategie-de-selection-des-elements.md et CLAUDE.md §Architecture) :
 * bascule de contexte WebView, gestes natifs, dispatch iOS/Android du bouton FranceConnect.
 * Un seul membre par point de couplage réellement constaté dans les Page Objects — pas
 * d'anticipation de besoins futurs.
 */
export interface PlatformAdapter {
  readonly kind: PlatformKind

  /** true sur Android (bouton FC natif) ; false sur iOS et en webapp (bouton dans le DOM). */
  readonly fcButtonIsNative: boolean

  /**
   * Exécute `callback` dans le contexte contenant le DOM de la SPA.
   * Mobile : bascule Appium NATIVE_APP → WEBVIEW_* puis restaure. Webapp : identité,
   * la session entière est déjà ce contexte.
   */
  inWebContext<T>(callback: () => Promise<T>): Promise<T>

  /** true si le DOM de la SPA est atteignable depuis l'état courant de la session. */
  isWebContextAvailable(): Promise<boolean>

  /** Force le recalcul de l'arbre d'accessibilité (no-op hors iOS). */
  refreshAxTree(): Promise<void>

  /** Déclenche le rafraîchissement "tirer vers le bas" de la SPA. */
  pullToRefresh(): Promise<void>
}
