import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs de l'écran de sélection d'environnement (review-picker staging).
 *
 * Écran natif sur les deux plateformes (liste Review Apps, visible uniquement sur le
 * build staging). Utilise AMI_ENV (fragment, correspondance partielle) pour cibler l'item
 * voulu.
 */

export interface EnvironmentPickerLocators {
  pickerSentinel:    Locator  // item "Staging" (toujours en tête) — confirme que l'écran picker est affiché
  environmentPicker: Locator  // item cible selon AMI_ENV (correspondance partielle)
}

export const androidEnvironmentPickerLocators: EnvironmentPickerLocators = {
  pickerSentinel:    'android=new UiSelector().text("Staging")',
  environmentPicker: '#toBeDefinedBy getEnvironmentPickerLocators()',
}

export const iosEnvironmentPickerLocators: EnvironmentPickerLocators = {
  pickerSentinel:    '-ios predicate string:label == "Staging"',
  environmentPicker: '#toBeDefinedBy getEnvironmentPickerLocators()',
}

export function getEnvironmentPickerLocators(): EnvironmentPickerLocators {
  const env = process.env.AMI_ENV || 'Staging'
  if (driver.isIOS) {
    return {
      ...iosEnvironmentPickerLocators,
      // type == StaticText : évite de matcher un conteneur parent dont le label agrégé contient le fragment
      // CONTAINS[c] : correspondance insensible à la casse (fragment ex : "1234" dans "PR-1234")
      environmentPicker: `-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS[c] "${env}"`,
    }
  }
  return {
    ...androidEnvironmentPickerLocators,
    environmentPicker: `android=new UiSelector().textContains("${env}")`,
  }
}
