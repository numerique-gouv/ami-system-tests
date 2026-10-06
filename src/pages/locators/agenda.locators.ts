/**
 * Sélecteurs de l'Agenda (`/#/agenda`) et du sélecteur de zones scolaires.
 * WebView/webapp, DOM identique — ciblage par nom accessible (vérifié en live le 2026-10-02).
 */
export const agendaLocators = {
  upcomingHeading: 'Prochainement',
  laterMonthsHeading: 'Les mois suivants',
  /** Bouton qui ouvre le dialogue d'un évènement (présent à l'identique sur chaque évènement). */
  eventDialogButtonName: /Ouvrir la modale liée à l.élément de l.agenda/,
  /** Libellé visible « Supprimer » ; nom accessible = aria-label du bouton (vérifié en live le 2026-10-02). */
  deleteActionName: /Cacher l.élément de l.agenda/,
  eventDialogCloseName: 'Fermer la modale',
  preferencesButtonName: 'Préférences',
  zonesHeading: 'Zones scolaires',
  zonesCloseButtonName: 'Fermer',
  /** Valeur de l'attribut `name` des cases du sélecteur de zones. */
  zoneCheckboxNames: [
    'Zone A', 'Zone B', 'Zone C', 'Corse', 'Guadeloupe', 'Guyane', 'Martinique', 'Mayotte',
    'Nouvelle Calédonie', 'Polynésie', 'Réunion', 'Saint Pierre et Miquelon', 'Wallis et Futuna',
  ],
  cityInputName: 'city-input',
}
