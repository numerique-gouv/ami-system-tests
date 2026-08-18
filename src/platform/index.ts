import type { PlatformAdapter } from './types'
import { appiumAdapter } from './appium.adapter'
import { browserAdapter } from './browser.adapter'

export type { PlatformAdapter, PlatformKind } from './types'

/**
 * Résout l'adaptateur pour la session courante. `browser.isMobile` est dérivé des
 * capabilities de session (aucun round-trip réseau) — pas de mise en cache nécessaire,
 * donc pas de state à invalider entre specs ou entre sessions Appium/navigateur.
 */
export function platform(): PlatformAdapter {
  return browser.isMobile ? appiumAdapter : browserAdapter
}
