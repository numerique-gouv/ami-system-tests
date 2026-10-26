/**
 * Sélecteurs de l'Agenda (`/#/agenda`). La page des zones scolaires a ses propres sélecteurs (zones.locators.ts).
 * WebView/webapp, DOM identique — ciblage par nom accessible (vérifié en live le 2026-10-02).
 */
export const agendaLocators = {
  /** Sélecteurs `role/…` des éléments répétés ou conditionnels (nom exact, apostrophes typographiques de la SPA). */
  eventDialogButton: 'button[data-testid^="agenda-item-"][data-testid$="-open-modal-button"]',
  /** Bouton « Masquer » de la modale (nom accessible « Masquer l’élément de l’agenda <titre> », variable : on cible le data-testid). */
  deleteAction: 'button[data-testid^="agenda-item-"][data-testid$="-hide-button"]',
  pageTitle: 'Mon agenda',
  upcomingHeading: 'Prochainement',
  laterMonthsHeading: 'Les mois suivants',
  eventDialogCloseName: 'Fermer',
  /**
   * Conteneur d'un élément de l'agenda dont le titre COMMENCE par `title`. Relevé en live le 2026-10-15, structure inchangée le 2026-10-26 (seuls les data-testid/libellés ont changé, front #1430) : un conteneur `div` porte,
   * comme enfants directs, le bouton d'ouverture de la modale (`data-testid` `agenda-item-<clé>-open-modal-button`, nom accessible « Ouvrir les options pour <titre sans emoji> ») et un bloc contenant `h4 > button` (le titre, suivi d'un emoji éventuel). Seul ce lien structurel relie le titre à son bouton
   * d'ouverture. `title` ne doit pas contenir de guillemet double.
   */
  eventItem: (title: string): string =>
    `//div[button[starts-with(@data-testid, "agenda-item-")][contains(@data-testid, "-open-modal-button")]][.//h4/button[starts-with(normalize-space(.), "${title}")]]`,
  /** Bouton d'ouverture de la modale, DANS un conteneur d'élément (`$(eventItem).$(...)`). */
  eventOpenInItem: 'button[data-testid$="-open-modal-button"]',
  /** Titre cliquable, DANS un conteneur d'élément. */
  eventTitleInItem: 'h4 > button',
  /** Tous les titres d'éléments de la page. */
  eventTitles: 'h4 > button[data-testid="agenda-item-link"]',
  preferencesButtonName: 'Préférences',
}
