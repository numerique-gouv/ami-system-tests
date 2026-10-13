import type { Locator } from '../types'

/**
 * Sélecteurs natifs de l'écran "mire" AMI — le bouton "S'identifier avec FranceConnect".
 *
 * Android : le bouton est un élément natif (contentDescription "franceConnect button").
 * iOS : il n'y a pas d'écran natif FC, le bouton est dans la WebView SPA (atteint par `findRole`
 * dans le Page Object) ; seule sa lecture dans l'arbre d'accessibilité natif a un sélecteur ici.
 */

/** Android seulement : le bouton natif (identifiant d'accessibilité unique). */
export const androidFcButton: Locator = '~franceConnect button'

/**
 * iOS seulement : le même bouton, lu dans l'arbre d'accessibilité NATIF (XCUITest expose le contenu de la
 * WebView). Sonde qui ne passe pas par le débogueur distant WebKit : à privilégier quand la page est en
 * navigation entre domaines (ex. fin de session FranceConnect après un logout), où un `execute` peut rester
 * sans réponse 120 s.
 * Mesuré le 2026-10-08 (iOS 27, simulateur) : trouvé 7,5 s après la confirmation d'un logout, appels de 83 ms.
 * <button> uniquement (comme la sonde web) : le pied de page eIDAS « En savoir plus sur FranceConnect » est un lien.
 */
export const iosFcButtonNativeAx: Locator =
  '-ios predicate string:type == "XCUIElementTypeButton" AND label CONTAINS[c] "FranceConnect"'

/**
 * Web (SPA, toutes plateformes sauf Android natif) : un bouton FranceConnect est-il affiché ? Texte « contient »,
 * insensible à la casse, restreint à un <button> : la mire eIDAS (hors app AMI) contient elle-même le mot « FranceConnect »
 * dans un lien de pied de page (« En savoir plus sur FranceConnect »), pas dans un bouton.
 */
export const webFcButtonAny: Locator = 'button.*=franceconnect'

/** Le bouton « S'identifier avec FranceConnect » à taper (fragment sans apostrophe : droite ou typographique selon la page). */
export const webFcButton: Locator = 'button*=identifier avec FranceConnect'
