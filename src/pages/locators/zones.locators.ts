/**
 * Sélecteurs de la page des zones scolaires (`/#/preferences/zones`).
 * WebView/webapp, DOM identique — vérifié en live le 2026-10-08. Depuis cette date c'est une PAGE (plus un dialogue),
 * atteinte depuis Agenda › « Préférences » et Préférences › « Zones scolaires ». « Retour à la page précédente » revient à
 * la page d'origine ; « Fermer » revient aux Préférences (vérifié seulement depuis les Préférences).
 * Le même contenu existe à `/welcome/zones` (onboarding, bouton « Passer » à la place de « Fermer »), voir onboarding-zones.locators.ts.
 */
export const zonesLocators = {
  pageTitle: 'Zones scolaires',
  closeButtonName: 'Fermer',
  backButtonName: 'Retour à la page précédente',
  /** Les 13 zones, dans l'ordre d'affichage (nom accessible des cases à cocher). */
  zoneNames: [
    'Zone A', 'Zone B', 'Zone C', 'Corse', 'Guadeloupe', 'Guyane', 'Martinique', 'Mayotte',
    'Nouvelle Calédonie', 'Polynésie', 'Réunion', 'Saint Pierre et Miquelon', 'Wallis et Futuna',
  ],
}
