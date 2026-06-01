import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs de l'écran de connexion FranceConnect.
 *
 * La surface de login est hybride : sur Android, le bouton FC est un élément natif
 * (contentDescription "franceConnect button"). Sur iOS, il n'y a pas d'écran natif FC :
 * le bouton est dans la WebView SPA — il doit être ciblé après switchContext('WEBVIEW_*').
 *
 * Le champ `fcButtonInWebView` indique au Page Object si un context switch est nécessaire.
 *
 * Le sélecteur du review-picker ("Staging") est natif sur les deux plateformes
 * (liste Review Apps, visible uniquement sur le build staging).
 */

export interface LoginLocators {
  stagingPicker:    Locator  // entrée "Staging" dans la liste review-picker (native)
  fcButton:         Locator  // bouton FranceConnect
  fcButtonInWebView: boolean // true → le sélecteur fcButton doit être évalué en WebView
}

export const androidLoginLocators: LoginLocators = {
  stagingPicker:    'android=new UiSelector().text("Staging")',
  fcButton:         '~franceConnect button',  // contentDescription (FranceConnexionScreen.kt:81)
  fcButtonInWebView: false,
}

export const iosLoginLocators: LoginLocators = {
  // Sur iOS, le review-picker est aussi une liste native (mêmes chaînes localisées)
  stagingPicker:    '-ios predicate string:label == "Staging"',
  // Sur iOS, le bouton FC est dans la WebView SPA (HomeView affiche directement la SPA)
  // Sélecteur WDIO `button=` : cible un <button> par son texte visible (contexte WebView)
  // U+2019 = apostrophe typographique française dans le texte de la SPA (ios.js:11)
  fcButton:         "button=S’identifier avec FranceConnect",
  fcButtonInWebView: true,
}

export function getLoginLocators(): LoginLocators {
  return driver.isIOS ? iosLoginLocators : androidLoginLocators
}
