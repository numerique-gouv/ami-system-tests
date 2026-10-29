import type {Locator} from '../types'

/**
 * Page mixte : sur Android le bouton est natif (`android`), sinon il est dans la SPA (`web`). Le Page Object choisit explicitement,
 * car il gère lui-même le passage du natif à la WebView.
 */
export const franceConnectMireLocators = {
  web: {
    // Sans apostrophe : droite ou typographique selon la page.
    button: 'button*=identifier avec FranceConnect',
    // `<button>` seulement : la mire eIDAS contient le mot dans un lien de pied de page.
    anyButton: 'button.*=franceconnect',
  },
  android: {
    button: '~franceConnect button',
  },
}

/** iOS : le bouton lu dans l'arbre natif, sans débogueur WebKit (à préférer quand la page change de domaine : un `execute` peut rester sans réponse 120 s). */
export const iosFcButtonNativeAx: Locator =
  '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "FranceConnect"'
