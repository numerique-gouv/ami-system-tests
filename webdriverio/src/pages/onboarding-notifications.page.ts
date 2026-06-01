/**
 * Page Object pour l'écran d'onboarding des notifications.
 *
 * Distinct de OnboardingPage (onboarding.page.ts) qui couvre l'onboarding d'accueil.
 * Cet écran apparaît après le premier login FC — il propose d'activer les notifications OS.
 *
 * Android : écran natif (OnboardingNotificationScreen.kt) — boutons sans resource-id stable,
 *           ciblés par texte visible via UIAutomator2.
 * iOS     : sheet SwiftUI (OnboardingView.swift) — mêmes chaînes localisées, sans
 *           accessibilityIdentifier — ciblés par texte via predicate string.
 */

const TITLE_TEXT   = 'Activez les notifications pour suivre vos démarches'
const DISMISS_TEXT = 'Peut-être plus tard'

class OnboardingNotificationsPage {
  /**
   * Ferme l'onboarding en tapant "Peut-être plus tard" (no-op si absent sous 5s).
   * L'écran apparaît 2-4 secondes après le login OIDC — un check instantané le raterait.
   * Après cette méthode, l'OS n'a pas accordé la permission push.
   */
  async dismiss(): Promise<void> {
    try {
      const onboarding = $(titleSelector())
      await onboarding.waitForDisplayed({ timeout: 20000 })
      await $(dismissSelector()).click()
      await onboarding.waitForDisplayed({ timeout: 10000, reverse: true })
    } catch {
      // Onboarding non visible dans les 5s — déjà refusé ou hors scope
    }
  }
}

// Sélecteurs par texte (pas de resource-id stable sur ces éléments)
function titleSelector(): string {
  return driver.isIOS
    ? `-ios predicate string:label == "${TITLE_TEXT}"`
    : `android=new UiSelector().text("${TITLE_TEXT}")`
}

function dismissSelector(): string {
  return driver.isIOS
    ? `-ios predicate string:label == "${DISMISS_TEXT}"`
    : `android=new UiSelector().text("${DISMISS_TEXT}")`
}

export default new OnboardingNotificationsPage()
