export type PlatformKind = 'android' | 'ios' | 'webapp'

/** WebView visée par `inWebContext`, désignée par son titre (contient, ou RegExp) ; à défaut, la dernière WebView hors workers. */
export interface WebViewTarget {
  title?: string | RegExp
}

/** Isole ce qui diffère entre Android, iOS et webapp ; un membre par point de couplage constaté dans les Page Objects. */
export interface PlatformAdapter {
  readonly kind: PlatformKind

  /** Android : bouton FranceConnect natif ; iOS et webapp : dans le DOM. */
  readonly fcButtonIsNative: boolean

  /** Exécute `callback` dans le contexte contenant le DOM de la SPA (webapp : identité). */
  inWebContext<T>(callback: () => Promise<T>): Promise<T>
  inWebContext<T>(target: WebViewTarget, callback: () => Promise<T>): Promise<T>

  isWebContextAvailable(): Promise<boolean>

  /** iOS : force le recalcul de l'arbre d'accessibilité. */
  refreshAxTree(): Promise<void>

  /** Rafraîchissement « tirer vers le bas ». */
  pullToRefresh(): Promise<void>
}
