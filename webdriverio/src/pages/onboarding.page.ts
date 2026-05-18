import { getOnboardingLocators } from './locators/onboarding.locators'

class OnboardingPage {
  /**
   * Vérifie que l'écran d'onboarding est affiché
   */
  async isVisible(): Promise<boolean> {
    const loc = getOnboardingLocators()
    const el = await $(loc.welcomeTitle)
    return el.isDisplayed()
  }

  /**
   * Retourne le texte du titre de bienvenue
   */
  async getTitle(): Promise<string> {
    const loc = getOnboardingLocators()
    return (await $(loc.welcomeTitle)).getText()
  }

  /**
   * Avance à l'étape suivante de l'onboarding
   */
  async continue(): Promise<void> {
    const loc = getOnboardingLocators()
    await (await $(loc.continueButton)).click()
  }

  /**
   * Passe l'onboarding en entier
   */
  async skip(): Promise<void> {
    const loc = getOnboardingLocators()
    const skipBtn = await $(loc.skipButton)
    if (await skipBtn.isDisplayed()) {
      await skipBtn.click()
    }
  }

  /**
   * Parcourt toutes les étapes de l'onboarding jusqu'à la fin
   */
  async completeAll(maxSteps = 5): Promise<void> {
    const loc = getOnboardingLocators()
    for (let i = 0; i < maxSteps; i++) {
      const continueBtn = await $(loc.continueButton)
      if (!(await continueBtn.isDisplayed())) break
      await continueBtn.click()
      await browser.pause(500)
    }
  }
}

export default new OnboardingPage()
