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
