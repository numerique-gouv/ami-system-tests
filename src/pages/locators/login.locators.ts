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
 * Le sélecteur du review-picker est natif sur les deux plateformes
 * (liste Review Apps, visible uniquement sur le build staging).
 * Il utilise AMI_ENV (fragment, correspondance partielle) pour cibler l'item voulu.
 */

export interface LoginLocators {
  pickerSentinel:    Locator  // item "Staging" (toujours en tête) — confirme que l'écran picker est affiché
  environmentPicker: Locator  // item cible selon AMI_ENV (correspondance partielle)
  fcButton:          Locator  // bouton FranceConnect
  fcButtonInWebView: boolean  // true si le sélecteur fcButton doit être évalué en WebView
}

export const androidLoginLocators: LoginLocators = {
  pickerSentinel:    'android=new UiSelector().text("Staging")',
  environmentPicker: '#toBeDefinedBy getLoginLocators()',
  fcButton:          '~franceConnect button',
  fcButtonInWebView: false,
}

export const iosLoginLocators: LoginLocators = {
  pickerSentinel:    '-ios predicate string:label == "Staging"',
  environmentPicker: '#toBeDefinedBy getLoginLocators()',
  // Sur iOS, le bouton FC est dans la WebView SPA (HomeView affiche directement la SPA)
  // Sélecteur WDIO `button=` : cible un <button> par son texte visible (contexte WebView)
  // U+2019 = apostrophe typographique française dans le texte de la SPA (ios.js:11)
  fcButton:         "button=S’identifier avec FranceConnect",
  fcButtonInWebView: true,
}

export function getLoginLocators(): LoginLocators {
  const env = process.env.AMI_ENV || 'Staging'
  if (driver.isIOS) {
    return {
      ...iosLoginLocators,
      // type == StaticText : évite de matcher un conteneur parent dont le label agrégé contient le fragment
      // CONTAINS[c] : correspondance insensible à la casse (fragment ex : "1234" dans "PR-1234")
      environmentPicker: `-ios predicate string:type == "XCUIElementTypeStaticText" AND label CONTAINS[c] "${env}"`,
    }
  }
  return {
    ...androidLoginLocators,
    environmentPicker: `android=new UiSelector().textContains("${env}")`,
  }
}
