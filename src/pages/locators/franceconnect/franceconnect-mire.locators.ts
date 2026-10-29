import type { Locator } from '../types'

/** Android : le bouton natif (identifiant d'accessibilité unique). */
export const androidFcButton: Locator = '~franceConnect button'

/** iOS : le bouton lu dans l'arbre natif, sans débogueur WebKit (à préférer quand la page change de domaine : un `execute` peut rester sans réponse 120 s). `<button>` seulement : le pied de page eIDAS est un lien. */
export const iosFcButtonNativeAx: Locator =
  '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "FranceConnect"'

/** Web : un bouton FranceConnect (la mire eIDAS contient le mot dans un lien de pied de page, pas dans un bouton). */
export const webFcButtonAny: Locator = 'button.*=franceconnect'

/** Le bouton « S'identifier avec FranceConnect » (sans apostrophe : droite ou typographique selon la page). */
export const webFcButton: Locator = 'button*=identifier avec FranceConnect'
