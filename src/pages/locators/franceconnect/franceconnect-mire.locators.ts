import type { Locator } from '../types'

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
  /**
   * Le même bouton, lu dans l'arbre d'accessibilité NATIF (XCUITest expose le contenu de la WebView). Sonde
   * qui ne passe pas par le débogueur distant WebKit : à privilégier quand la page est en navigation entre
   * domaines (ex. fin de session FranceConnect après un logout), où un `execute` peut rester sans réponse
   * 120 s. `null` : sans objet (Android : le bouton est déjà natif).
   */
  fcButtonNativeAx:  Locator | null
}

export const androidFranceConnectMireLocators: FranceConnectMireLocators = {
  fcButton:          '~franceConnect button',
  fcButtonInWebView: false,
  fcButtonNativeAx:  null,
}

export const iosFranceConnectMireLocators: FranceConnectMireLocators = {
  // Sur iOS, le bouton FC est dans la WebView SPA (HomeView affiche directement la SPA)
  // Sélecteur WDIO `button=` : cible un <button> par son texte visible (contexte WebView)
  // U+2019 = apostrophe typographique française dans le texte de la SPA (ios.js:11)
  fcButton:         "button=S’identifier avec FranceConnect",
  fcButtonInWebView: true,
  // Mesuré le 2026-10-08 (iOS 27, simulateur) : trouvé 7,5 s après la confirmation d'un logout, appels de 83 ms.
  // <button> uniquement (comme la sonde web) : le pied de page eIDAS « En savoir plus sur FranceConnect » est un lien.
  fcButtonNativeAx:  '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "FranceConnect"',
}

export function getFranceConnectMireLocators(): FranceConnectMireLocators {
  return driver.isIOS ? iosFranceConnectMireLocators : androidFranceConnectMireLocators
}
