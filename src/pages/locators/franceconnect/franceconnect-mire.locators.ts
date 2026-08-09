import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs de l'écran "mire" AMI — le bouton "S'identifier avec FranceConnect".
 *
 * Hybride : sur Android, le bouton FC est un élément natif (contentDescription
 * "franceConnect button"). Sur iOS, il n'y a pas d'écran natif FC : le bouton est dans la
 * WebView SPA — il doit être ciblé après switchContext('WEBVIEW_*').
 *
 * Le champ `fcButtonInWebView` indique au Page Object si un context switch est nécessaire.
 */

export interface FranceConnectMireLocators {
  fcButton:          Locator  // bouton FranceConnect
  fcButtonInWebView: boolean  // true si le sélecteur fcButton doit être évalué en WebView
}

export const androidFranceConnectMireLocators: FranceConnectMireLocators = {
  fcButton:          '~franceConnect button',
  fcButtonInWebView: false,
}

export const iosFranceConnectMireLocators: FranceConnectMireLocators = {
  // Sur iOS, le bouton FC est dans la WebView SPA (HomeView affiche directement la SPA)
  // Sélecteur WDIO `button=` : cible un <button> par son texte visible (contexte WebView)
  // U+2019 = apostrophe typographique française dans le texte de la SPA (ios.js:11)
  fcButton:         "button=S’identifier avec FranceConnect",
  fcButtonInWebView: true,
}

export function getFranceConnectMireLocators(): FranceConnectMireLocators {
  return driver.isIOS ? iosFranceConnectMireLocators : androidFranceConnectMireLocators
}
