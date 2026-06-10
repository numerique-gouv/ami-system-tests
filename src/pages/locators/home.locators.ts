import type { Locator } from './onboarding.locators'

/**
 * L'app AMI est 100% Svelte SPA rendue dans un android.webkit.WebView / WKWebView.
 * Il n'existe aucun resource-id Android ni accessibilityIdentifier iOS côté natif
 * (les écrans Compose/SwiftUI n'exposent pas de testTag).
 *
 * Stratégie :
 *   screenRoot → sélecteur natif qui détecte la présence du conteneur WebView
 *   userAvatarCss → sélecteur CSS DOM (dans WEBVIEW_*) qui confirme que la SPA
 *                   home est authentifiée et chargée (#notification-icon toujours
 *                   présent sur le home — confirmé par Appium Inspector).
 */
export interface HomeLocators {
  screenRoot:    Locator  // Natif : conteneur WebView
  userAvatarCss: Locator  // WebView CSS : sentinel SPA home authentifiée
}

export const androidHomeLocators: HomeLocators = {
  // UiSelector sur la classe du conteneur WebView (seul identifiant natif disponible)
  screenRoot:    'android=new UiSelector().className("android.webkit.WebView")',
  userAvatarCss: '#notification-icon',
}

export const iosHomeLocators: HomeLocators = {
  // XCUITest : type WebView natif
  screenRoot:    '//XCUIElementTypeWebView',
  userAvatarCss: '#notification-icon',
}

export function getHomeLocators(): HomeLocators {
  return driver.isIOS ? iosHomeLocators : androidHomeLocators
}
