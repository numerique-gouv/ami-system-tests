import type { Locator } from './types'

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

// iOS : l'écran existe DEUX fois dans l'arbre natif (constaté le 2026-10-08) : la feuille SwiftUI et la page de la SPA
// `/#/welcome/notifications` rendue derrière, que l'arbre d'accessibilité expose aussi. Les deux boutons portent le même
// libellé, sans identifiant (ni `accessibilityIdentifier` dans l'app, ni `data-testid` visible nativement) : rien de
// stable ne les distingue, et ni « natif ou WebView » ni la position ne tiendront quand les pages passeront en natif.
// Décision : on prend le PREMIER (ce que faisait WDIO 9) et la page signale l'écart (`firstNative`). Les apps et la SPA
// ne sont pas modifiées. Quand le doublon disparaît, il ne reste qu'un élément et l'avertissement cesse.
export const iosOnboardingNotifLocators: OnboardingNotifLocators = {
  title:   '-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS[c] "notifications pour suivre"',
  dismiss: '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "plus tard"',
}

/**
 * Webapp : même écran rendu par la SPA (route `/#/welcome/notifications`, titre h1 « Activez les
 * notifications pour suivre vos démarches », boutons « Activer » / « Peut-être plus tard ») —
 * vérifié en live sur staging le 2026-10-02. Ciblage par nom accessible ; « Activer » n'est jamais
 * utilisé (il déclencherait la demande de permission de notification).
 */
export const webOnboardingNotifLocators = {
  laterButtonName: /plus tard/i,
}

export function getOnboardingNotifLocators(): OnboardingNotifLocators {
  return driver.isIOS ? iosOnboardingNotifLocators : androidOnboardingNotifLocators
}
