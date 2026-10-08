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
// Android : vérifié sur l'émulateur le 2026-10-08, la tuile est une `View` cliquable qui contient deux `TextView`
// « Staging » (titre et sous-titre). On vise la tuile entière (un seul élément, `getText()` renvoie son titre),
// comme sur iOS, avec `startsWith` sur le texte d'un enfant. `text("Staging")` seul donnait 2 éléments : WDIO 10 lève
// une `strict mode violation`, que `isEnvironmentPickerVisible` avale ; le picker était jugé absent, la tuile jamais
// cliquée et l'app ne chargeait jamais de WebView (21 échecs Android constatés).
const PICKER_SENTINEL = {
  android: 'android=new UiSelector().clickable(true).childSelector(new UiSelector().textStartsWith("Staging"))',
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
    // (ex. "staging" vs tile "Staging"). La tuile entière, pas ses textes (cf. ci-dessus).
    environmentPicker: `android=new UiSelector().clickable(true).childSelector(new UiSelector().textMatches("(?i).*${env}.*"))`,
  }
}
