import {platform} from '../../platform'
import type {ContextKind, PlatformKind} from '../../platform'

/** Les locators d'une page : `web` (webapp et WebView mobile), `android` et `ios` (page native sur cette plateforme). Chacun est facultatif. */
export interface LocatorVariants<T> {
  web?: T
  android?: T
  ios?: T
}

/** Dans une WebView ou en webapp : `web`. Sur mobile hors WebView : la plateforme. Une variante absente est une erreur technique. */
export function chooseLocators<T>(page: string, variants: LocatorVariants<T>, context: ContextKind, kind: PlatformKind): T {
  const wanted = context === 'web' ? 'web' : kind as 'android' | 'ios'
  const locators = variants[wanted]
  if (!locators) throw new Error(`${page} n'a pas de locators ${wanted}${wanted === 'web' ? '' : ' : l\'appeler dans un inWebContext'}`)
  return locators
}

/** Les locators de `page` adaptés au contexte courant de l'appelant. */
export function pickLocators<T>(page: string, variants: LocatorVariants<T>): T {
  return chooseLocators(page, variants, platform().context(), platform().kind)
}

/** La page a-t-elle une version native sur la plateforme courante ? */
export function hasNativeLocators<T>(variants: LocatorVariants<T>): boolean {
  const kind = platform().kind
  return kind !== 'webapp' && variants[kind] !== undefined
}
