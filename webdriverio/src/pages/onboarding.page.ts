import { getOnboardingLocators } from './locators/onboarding.locators'

class OnboardingPage {
  /**
   * Vérifie que l'écran d'onboarding est affiché
   */
  async isVisible(): Promise<boolean> {
    try {
      const loc = getOnboardingLocators()
      return await $(loc.welcomeTitle).isDisplayed()
    } catch {
      return false
    }
  }

  /**
   * Retourne le texte du titre de bienvenue
   */
  async getTitle(): Promise<string> {
    const loc = getOnboardingLocators()
    return await $(loc.welcomeTitle).getText()
  }

  async continue(): Promise<void> {
    const loc = getOnboardingLocators()
    await $(loc.continueButton).click()
  }

  async skip(): Promise<void> {
    const loc = getOnboardingLocators()
    const skipBtn = $(loc.skipButton)
    if (await skipBtn.isDisplayed()) {
      await skipBtn.click()
    }
  }

  /**
   * Parcourt toutes les étapes de l'onboarding jusqu'à la fin.
   * Attend que le bouton soit cliquable à chaque étape — gère l'animation de transition.
   */
  async completeAll(maxSteps = 5): Promise<void> {
    const loc = getOnboardingLocators()
    for (let i = 0; i < maxSteps; i++) {
      const continueBtn = $(loc.continueButton)
      if (!(await continueBtn.isDisplayed().catch(() => false))) break
      await continueBtn.waitForClickable({ timeout: 3000 })
      await continueBtn.click()
    }
  }
}

export default new OnboardingPage()
