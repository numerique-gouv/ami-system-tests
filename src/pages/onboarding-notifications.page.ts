import {getOnboardingNotifLocators} from './locators/onboarding-notifications.locators'
import {traced} from '../helpers/traced'

/**
 * Page Object pour l'écran d'onboarding des notifications.
 *
 * Distinct de OnboardingPage (onboarding.page.ts) qui couvre l'onboarding d'accueil.
 * Cet écran apparaît après le premier login FC — il propose d'activer les notifications OS.
 *
 * Android : écran natif (OnboardingNotificationScreen.kt) — boutons sans resource-id stable.
 * iOS     : sheet SwiftUI (OnboardingView.swift) — sans accessibilityIdentifier.
 */

class OnboardingNotificationsPage {
  /**
   * Ferme l'onboarding en tapant "Peut-être plus tard" (no-op si absent sous 5s).
   * L'écran apparaît 2-4 secondes après le login OIDC — un check instantané le raterait.
   * Après cette méthode, l'OS n'a pas accordé la permission push.
   *
   * Sur iOS, le dialog système de permission push peut apparaître avant l'écran custom
   * (selon la version iOS et l'état du simulateur) : on le refuse via dismissAlert() en
   * amont pour ne pas bloquer la détection de l'écran custom de l'app.
   *
   * waitForExist() est préféré à waitForDisplayed() pour la détection initiale :
   * sur iOS, un élément SwiftUI présent dans l'arbre XCUITest peut avoir
   * isDisplayed=false pendant l'animation d'entrée de la sheet.
   */
  async dismiss(): Promise<void> {
    const loc = getOnboardingNotifLocators()
    await $(loc.dismiss).waitForExist({ timeout: 10000 })
    await $(loc.dismiss).click()
    await $(loc.title).waitForDisplayed({ timeout: 1000, reverse: true })
  }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
