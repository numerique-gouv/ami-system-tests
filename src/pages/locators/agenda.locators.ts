/**
 * Sélecteurs de l'Agenda (`/#/agenda`). La page des zones scolaires a ses propres sélecteurs (zones.locators.ts).
 * WebView/webapp, DOM identique — ciblage par nom accessible (vérifié en live le 2026-10-02).
 */
export const agendaLocators = {
  pageTitle: 'Mon agenda',
  upcomingHeading: 'Prochainement',
  laterMonthsHeading: 'Les mois suivants',
  /** Bouton qui ouvre le dialogue d'un évènement (présent à l'identique sur chaque évènement). */
  eventDialogButtonName: /Ouvrir la modale liée à l.élément de l.agenda/,
  /** Libellé visible « Supprimer » ; nom accessible = aria-label du bouton (vérifié en live le 2026-10-02). */
  deleteActionName: /Cacher l.élément de l.agenda/,
  eventDialogCloseName: 'Fermer la modale',
  preferencesButtonName: 'Préférences',
}
