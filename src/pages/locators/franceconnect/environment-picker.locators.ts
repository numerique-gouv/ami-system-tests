import type { Locator } from '../types'

export interface EnvironmentPickerLocators {
  pickerSentinel:    Locator  // item « Staging », toujours en tête : confirme que le picker est affiché
  environmentPicker: Locator  // item cible selon AMI_ENV (correspondance partielle)
  /** Conteneur à faire défiler ; `undefined` : celui par défaut de WDIO (iOS : l'application entière). */
  scrollContainer?: Locator
}

// La tuile « Staging » est un seul élément qui contient deux textes identiques (titre et sous-titre) : viser la tuile et non le texte,
// que le mode strict de `$()` refuse. Android : la liste Compose n'est pas un `android.widget.ScrollView`, d'où `scrollContainer`.
const PICKER_SENTINEL = {
  android: 'android=new UiSelector().clickable(true).childSelector(new UiSelector().textStartsWith("Staging"))',
  ios:     '-ios predicate string:type == "XCUIElementTypeButton" AND label BEGINSWITH "Staging"',
} satisfies Record<'android' | 'ios', Locator>

/** Seul locator calculé depuis une variable d'environnement : `environmentPicker` dépend d'AMI_ENV. */
export function getEnvironmentPickerLocators(): EnvironmentPickerLocators {
  const env = process.env.AMI_ENV || 'Staging'
  if (driver.isIOS) {
    return {
      pickerSentinel: PICKER_SENTINEL.ios,
      environmentPicker: `-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "${env}"`,
    }
  }
  return {
    pickerSentinel: PICKER_SENTINEL.android,
    scrollContainer: 'android=new UiSelector().scrollable(true)',
    environmentPicker: `android=new UiSelector().clickable(true).childSelector(new UiSelector().textMatches("(?i).*${env}.*"))`,
  }
}
