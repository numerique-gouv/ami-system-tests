/**
 * Localisateurs de l'écran d'onboarding.
 *
 * Android : préfixe `id:` → resource-id Appium
 * iOS     : préfixe `~`  → accessibilityIdentifier (shorthand WebdriverIO)
 *
 * Convention : demander aux devs de poser le même identifiant des deux côtés
 * pour les éléments communs → un seul localisateur `~` suffit alors.
 */

export type Locator = string

export interface OnboardingLocators {
  welcomeTitle: Locator
  welcomeDescription: Locator
  continueButton: Locator
  skipButton: Locator
  stepIndicator: Locator
}

export const androidOnboardingLocators: OnboardingLocators = {
  welcomeTitle:       'id:fr.gouv.ami.staging:id/onboarding_title',
  welcomeDescription: 'id:fr.gouv.ami.staging:id/onboarding_description',
  continueButton:     'id:fr.gouv.ami.staging:id/onboarding_continue_button',
  skipButton:         'id:fr.gouv.ami.staging:id/onboarding_skip_button',
  stepIndicator:      'id:fr.gouv.ami.staging:id/onboarding_step_indicator',
}

export const iosOnboardingLocators: OnboardingLocators = {
  welcomeTitle:       '~onboarding_title',
  welcomeDescription: '~onboarding_description',
  continueButton:     '~onboarding_continue_button',
  skipButton:         '~onboarding_skip_button',
  stepIndicator:      '~onboarding_step_indicator',
}

export function getOnboardingLocators(): OnboardingLocators {
  return driver.isIOS ? iosOnboardingLocators : androidOnboardingLocators
}
