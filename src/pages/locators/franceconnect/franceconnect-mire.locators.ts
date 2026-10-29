import type {LocatorVariants} from '../../../helpers/common/pick-locators'
import type {Locator} from '../types'

export interface FranceConnectMireLocators {
  /** Le bouton « S'identifier avec FranceConnect ». */
  button: Locator
  /** Un bouton FranceConnect, quel que soit son libellé exact. */
  anyButton: Locator
}

/**
 * Page mixte : sur Android le bouton est natif (`android`), sinon il est dans la SPA (`web`). Le Page Object choisit explicitement, car il
 * gère lui-même le passage du natif à la WebView.
 */
export const franceConnectMireLocators: LocatorVariants<FranceConnectMireLocators> = {
  web: {
    // Sans apostrophe : droite ou typographique selon la page.
    button: 'button*=identifier avec FranceConnect',
    // `<button>` seulement : la mire eIDAS contient le mot dans un lien de pied de page.
    anyButton: 'button.*=franceconnect',
  },
  android: {
    button: '~franceConnect button',
    anyButton: '~franceConnect button',
  },
}

/** iOS : le bouton lu dans l'arbre natif, sans débogueur WebKit (à préférer quand la page change de domaine : un `execute` peut rester sans réponse 120 s). */
export const iosFcButtonNativeAx: Locator =
  '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "FranceConnect"'
