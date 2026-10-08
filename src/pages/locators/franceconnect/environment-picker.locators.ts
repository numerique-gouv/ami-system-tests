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
//
// iOS : la tuile est un seul bouton (label « Staging, Staging » : titre + sous-titre) ; viser le bouton et non
// le texte « Staging », qui existe deux fois (titre et sous-titre) et que WDIO 10 refuse (`$()` strict).
// Android : `text("Staging")` peut avoir le même défaut (titre et sous-titre) — à vérifier sur l'émulateur.
const PICKER_SENTINEL = {
  android: 'android=new UiSelector().text("Staging")',
  ios:     '-ios predicate string:type == "XCUIElementTypeButton" AND label BEGINSWITH "Staging"',
} satisfies Record<'android' | 'ios', Locator>

export function getEnvironmentPickerLocators(): EnvironmentPickerLocators {
  const env = process.env.AMI_ENV || 'Staging'
  if (driver.isIOS) {
    return {
      pickerSentinel: PICKER_SENTINEL.ios,
      // type == Button : la tuile entière (un seul élément), alors que le titre et le sous-titre sont deux textes
      // pouvant porter le même label (ambigu sous WDIO 10).
      // CONTAINS[c] : correspondance insensible à la casse (fragment ex : "1234" dans "PR-1234")
      environmentPicker: `-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "${env}"`,
    }
  }
  return {
    pickerSentinel: PICKER_SENTINEL.android,
    // (ex. "staging" vs tile "Staging").
    environmentPicker: `android=new UiSelector().textMatches("(?i).*${env}.*")`,
  }
}
