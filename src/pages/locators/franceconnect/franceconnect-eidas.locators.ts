/**
 * Sélecteurs de l'écran eIDAS de la mire FranceConnect (sélection eIDAS faible).
 *
 * WebView, structure identique Android/iOS (page hors app AMI, hors contrôle du DSFR).
 */

export interface FranceConnectEidasLocators {
  eidasFaibleLabel: string  // nom accessible du lien eIDAS faible (pour tl().getByRole dans le PO)
}

/**
 * Nom accessible confirmé via just inspect (2026-06-26).
 * L'IDP eIDAS faible expose role="link" + nom accessible "Démonstration eIDAS faible".
 * Pas d'aria-label HTML — ciblage par rôle+nom via TL :
 *   tl().getByRole('link', { name: new RegExp(fcEidasLocators.eidasFaibleLabel, 'i') })
 */
export const fcEidasLocators: FranceConnectEidasLocators = {
  eidasFaibleLabel: 'eIDAS faible',
}

// Pas de getXxxLocators() — un seul jeu cross-platform
