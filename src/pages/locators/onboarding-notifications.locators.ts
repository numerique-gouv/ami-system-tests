import type { Locator } from './onboarding.locators'

/**
 * Localisateurs de l'écran d'onboarding notifications (post-login).
 *
 * Ces éléments natifs n'ont pas d'accessibilityIdentifier/resource-id stable.
 * Ciblage par texte visible : UIAutomator2 sur Android, predicate string sur iOS.
 *
 * iOS : CONTAINS[c] (insensible à la casse) préféré à == exact :
 * SwiftUI peut enrichir l'accessibilityLabel d'un StaticText,
 * et la correspondance exacte de chaînes accentuées via predicate string
 * est instable selon la version Appium/WDA.
 */

export interface OnboardingNotifLocators {
  title:   Locator
  dismiss: Locator
}

export const androidOnboardingNotifLocators: OnboardingNotifLocators = {
  title:   'android=new UiSelector().text("Activez les notifications pour suivre vos démarches")',
  dismiss: 'android=new UiSelector().text("Peut-être plus tard")',
}

export const iosOnboardingNotifLocators: OnboardingNotifLocators = {
  title:   '-ios predicate string:label CONTAINS[c] "notifications pour suivre"',
  dismiss: '-ios predicate string:label CONTAINS[c] "plus tard"',
}

export function getOnboardingNotifLocators(): OnboardingNotifLocators {
  return driver.isIOS ? iosOnboardingNotifLocators : androidOnboardingNotifLocators
}
