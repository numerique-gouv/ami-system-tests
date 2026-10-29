export type PlatformKind = 'android' | 'ios' | 'webapp'

/** `web` : webapp, ou WebView sur mobile (dans un `inWebContext`) ; `native` : mobile hors WebView. */
export type ContextKind = 'web' | 'native'

/** WebView visée par `inWebContext`, désignée par son titre (contient, ou RegExp) ; à défaut, la dernière WebView hors workers. */
export interface WebViewTarget {
  title?: string | RegExp
}

/** Isole ce qui diffère entre Android, iOS et webapp ; un membre par point de couplage constaté dans les Page Objects. */
export interface PlatformAdapter {
  readonly kind: PlatformKind

  /** Contexte courant, lu en mémoire : mis à jour à chaque lecture de `driver.getContext()` et à chaque bascule de l'adaptateur. */
  context(): ContextKind

  /** Relit `driver.getContext()` et met la mémoire à jour (après un changement de contexte hors de l'adaptateur). */
  syncContext(): Promise<ContextKind>

  /** Exécute `callback` dans le contexte contenant le DOM de la SPA (webapp : identité). */
  inWebContext<T>(callback: () => Promise<T>): Promise<T>
  inWebContext<T>(target: WebViewTarget, callback: () => Promise<T>): Promise<T>

  isWebContextAvailable(): Promise<boolean>

  /** iOS : force le recalcul de l'arbre d'accessibilité. */
  refreshAxTree(): Promise<void>

  /** Rafraîchissement « tirer vers le bas ». */
  pullToRefresh(): Promise<void>
}
