import type { PlatformAdapter } from './types'
import { appiumAdapter } from './appium.adapter'
import { browserAdapter } from './browser.adapter'

export type { PlatformAdapter, PlatformKind, WebViewTarget } from './types'

export function platform(): PlatformAdapter {
  return browser.isMobile ? appiumAdapter : browserAdapter
}
