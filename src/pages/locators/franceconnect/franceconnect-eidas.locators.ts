/**
 * Sélecteurs de l'écran eIDAS de la mire FranceConnect (sélection eIDAS faible).
 *
 * WebView, structure identique Android/iOS (page hors app AMI, hors contrôle du DSFR). Relevé du 2026-10-13 : chaque IDP est
 * un `<button type="submit" role="link">` (icône + texte), dont Chrome calcule le nom accessible AVEC une espace finale
 * (« Démonstration eIDAS faible␠ ») : `role/link[name="…"]`, qui compare exactement, ne le trouve donc pas. Ciblage par
 * texte visible contient (`button*=`).
 */
export const fcEidasLocators = {
  eidasFaibleLink: 'button*=eIDAS faible',
}

// Pas de getXxxLocators() — un seul jeu cross-platform

/**
 * iOS seulement : le même bouton lu dans l'arbre d'accessibilité NATIF (XCUITest expose le contenu de la WebView ; type Link, libellé
 * « Démonstration eIDAS faible », relevé en live le 2026-10-27). Sonde qui ne passe pas par le débogueur WebKit : sert à constater
 * l'apparition de la page eIDAS et sa disparition après le clic, sans envoyer de commande à une page en cours de remplacement.
 */
export const iosEidasLinkNativeAx = '-ios predicate string:label CONTAINS[c] "eidas faible"'
