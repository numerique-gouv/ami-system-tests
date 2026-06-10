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
   * Ferme l'onboarding en tapant "Peut-être plus tard" (no-op si absent sous 20s).
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
    if (driver.isIOS) {
      try { await driver.dismissAlert() } catch { /* pas de dialog système OS — cas normal */ }
    }
    try {
      const onboarding = $(titleSelector())
      await onboarding.waitForExist({ timeout: 5000 })
      await $(dismissSelector()).click()
      await onboarding.waitForDisplayed({ timeout: 1000, reverse: true })
    } catch {
      // Onboarding non visible dans les 20s — déjà refusé ou hors scope
    }
  }
}

// Sélecteurs par texte (pas de resource-id stable sur ces éléments).
// iOS : CONTAINS[c] (insensible à la casse) plutôt que == exact, car SwiftUI peut
// enrichir l'accessibilityLabel d'un StaticText (ex. suffixe de contexte) et parce
// que la correspondance exacte de chaînes Unicode accentuées via predicate string
// se révèle instable selon la version d'Appium/WDA.
function titleSelector(): string {
  return driver.isIOS
    ? `-ios predicate string:label CONTAINS[c] "notifications pour suivre"`
    : `android=new UiSelector().text("${TITLE_TEXT}")`
}

function dismissSelector(): string {
  return driver.isIOS
    ? `-ios predicate string:label CONTAINS[c] "plus tard"`
    : `android=new UiSelector().text("${DISMISS_TEXT}")`
}

export default new OnboardingNotificationsPage()
