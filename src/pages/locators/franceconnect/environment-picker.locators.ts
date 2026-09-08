import type { Locator } from '../types'

/**
 * Sélecteurs de l'écran de sélection d'environnement (review-picker staging).
 *
 * Écran natif sur les deux plateformes (liste Review Apps, visible uniquement sur le
 * build staging). Utilise AMI_ENV (fragment, correspondance partielle) pour cibler l'item
 * voulu.
 */

export interface EnvironmentPickerLocators {
  pickerSentinel:    Locator  // item "Staging" (toujours en tête) — confirme que l'écran picker est affiché
  environmentPicker: Locator  // item cible selon AMI_ENV (correspondance partielle), calculé par getEnvironmentPickerLocators()
}

// Seul le sentinel est une valeur statique par plateforme — `environmentPicker` dépend de
// process.env.AMI_ENV à l'exécution et n'a pas de valeur par défaut sensée (voir le getter
// ci-dessous). C'est le seul locator du dépôt calculé dynamiquement depuis une variable
// d'environnement.
const PICKER_SENTINEL = {
  android: 'android=new UiSelector().text("Staging")',
  ios:     '-ios predicate string:label == "Staging"',
} satisfies Record<'android' | 'ios', Locator>

export function getEnvironmentPickerLocators(): EnvironmentPickerLocators {
  const env = process.env.AMI_ENV || 'Staging'
  if (driver.isIOS) {
    return {
      pickerSentinel: PICKER_SENTINEL.ios,
      // type == StaticText : évite de matcher un conteneur parent dont le label agrégé contient le fragment
      // CONTAINS[c] : correspondance insensible à la casse (fragment ex : "1234" dans "PR-1234")
      environmentPicker: `-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS[c] "${env}"`,
    }
  }
  return {
    pickerSentinel: PICKER_SENTINEL.android,
    // (ex. "staging" vs tile "Staging").
    environmentPicker: `android=new UiSelector().textMatches("(?i).*${env}.*")`,
  }
}
