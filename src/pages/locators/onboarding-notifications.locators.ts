import type { Locator } from './types'

// Éléments natifs sans identifiant stable : ciblage par texte visible. iOS : CONTAINS[c] plutôt que ==, la correspondance exacte de chaînes accentuées est instable.

export interface OnboardingNotifLocators {
  title:   Locator
  dismiss: Locator
  /** iOS seulement : bouton « Activer » de la feuille native. */
  activate?: Locator
}

/**
 * Page mixte : sur Android la route SPA (`web`), avec repli sur l'écran natif d'un ancien build (`android`) ; sur iOS la feuille native
 * (`ios`) et la route de la SPA derrière elle (`web`). Le Page Object choisit explicitement.
 */
export const onboardingNotificationsLocators = {
  web: {
    /** Le bouton « plus tard » existe aussi sur l'écran passkey : le titre identifie l'écran. */
    heading: 'h1*=Activez les notifications',
    laterButton: 'button*=plus tard',
  },
  android: {
    title:   'android=new UiSelector().text("Activez les notifications pour suivre vos démarches")',
    dismiss: 'android=new UiSelector().text("Peut-être plus tard")',
  } as OnboardingNotifLocators,
  // iOS : la feuille SwiftUI et la page de la SPA derrière elle sont toutes deux dans l'arbre natif, avec les mêmes libellés et sans identifiant.
  // `hittable == 1` ne garde que le bouton de la feuille, au premier plan.
  ios: {
    title:   '-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS[c] "notifications pour suivre"',
    dismiss: '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "plus tard" AND hittable == 1',
    activate: '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Activer" AND hittable == 1',
  } as OnboardingNotifLocators,
}
