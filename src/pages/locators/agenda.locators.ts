export const agendaLocators = {
  eventDialogButton: 'button[data-testid^="agenda-item-"][data-testid$="-open-modal-button"]',
  /** « Masquer » de la modale : son nom accessible contient le titre, on cible le data-testid. */
  deleteAction: 'button[data-testid^="agenda-item-"][data-testid$="-hide-button"]',
  pageTitle: 'Mon agenda',
  upcomingHeading: 'Prochainement',
  laterMonthsHeading: 'Les mois suivants',
  eventDialogCloseName: 'Fermer',
  /**
   * Conteneur d'un élément dont le titre commence par `title` (sans guillemet double) : le lien structurel entre le titre (`h4 > button`)
   * et son bouton d'ouverture de modale (enfant direct du même `div`) est le seul qui existe.
   */
  eventItem: (title: string): string =>
    `//div[button[starts-with(@data-testid, "agenda-item-")][contains(@data-testid, "-open-modal-button")]][.//h4/button[starts-with(normalize-space(.), "${title}")]]`,
  /** Dans un conteneur d'élément. */
  eventOpenInItem: 'button[data-testid$="-open-modal-button"]',
  /** Dans un conteneur d'élément. */
  eventTitleInItem: 'h4 > button',
  eventTitles: 'h4 > button[data-testid="agenda-item-link"]',
  preferencesButtonName: 'Préférences',
}
