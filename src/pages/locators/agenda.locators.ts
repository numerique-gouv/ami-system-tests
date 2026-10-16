import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs de l'Agenda (`/#/agenda`). La page des zones scolaires a ses propres sélecteurs (zones.locators.ts).
 * WebView/webapp, DOM identique — ciblage par nom accessible (vérifié en live le 2026-10-02).
 */
export const agendaLocators = {
  /** Sélecteurs `role/…` des éléments répétés ou conditionnels (nom exact, apostrophes typographiques de la SPA). */
  eventDialogButton: roleSelector('button', 'Ouvrir la modale liée à l’élément de l’agenda'),
  deleteAction: roleSelector('button', 'Cacher l’élément de l’agenda'),
  pageTitle: 'Mon agenda',
  upcomingHeading: 'Prochainement',
  laterMonthsHeading: 'Les mois suivants',
  /** Bouton qui ouvre le dialogue d'un évènement (présent à l'identique sur chaque évènement). */
  eventDialogButtonName: 'Ouvrir la modale liée à l’élément de l’agenda',
  /** Libellé visible « Supprimer » ; nom accessible = aria-label du bouton (vérifié en live le 2026-10-02). */
  deleteActionName: 'Cacher l’élément de l’agenda',
  eventDialogCloseName: 'Fermer la modale',
  /**
   * Conteneur d'un élément de l'agenda dont le titre COMMENCE par `title`. Relevé en live le 2026-10-15 : un conteneur `div` porte,
   * comme enfants directs, le bouton d'ouverture de la modale (`data-testid` préfixé `open-agenda-item-modal-`, sans le titre dans son
   * nom) et un bloc contenant `h4 > button` (le titre, suivi d'un emoji éventuel). Seul ce lien structurel relie le titre à son bouton
   * d'ouverture. `title` ne doit pas contenir de guillemet double.
   */
  eventItem: (title: string): string =>
    `//div[button[starts-with(@data-testid, "open-agenda-item-modal-")]][.//h4/button[starts-with(normalize-space(.), "${title}")]]`,
  /** Bouton d'ouverture de la modale, DANS un conteneur d'élément (`$(eventItem).$(...)`). */
  eventOpenInItem: 'button[data-testid^="open-agenda-item-modal-"]',
  /** Titre cliquable, DANS un conteneur d'élément. */
  eventTitleInItem: 'h4 > button',
  /** Tous les titres d'éléments de la page. */
  eventTitles: 'h4 > button[data-testid="agenda-item-link"]',
  preferencesButtonName: 'Préférences',
}
