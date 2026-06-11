/**
 * Sélecteurs WebView de la page de suivi des démarches.
 *
 * Structure DOM (DSFR fr-tile, Svelte) observée via `just inspect` :
 *   [role="tabpanel"]
 *     .fr-tile__content          ← conteneur d'une carte
 *       .fr-tile__title          ← titre visible (contient un <a> optionnel)
 *       .fr-tile__start
 *         .fr-badge              ← libellé de statut (ex. "Brouillon", "Terminé")
 *
 * Règle : chercher par le titre visible (.fr-tile__title), pas par le lien
 * (l'URL externe est facultative — certaines cartes n'ont pas de <a>).
 */

export interface DemarchesLocators {
  /** Conteneurs de carte scopés au tabpanel actif */
  cardContent: string
  /** Titre visible dans une carte (peut contenir un <a>, peut ne pas en avoir) */
  cardTitle: string
  /** Badge de statut dans une carte */
  cardBadge: string
  /** Lien externe optionnel dans une carte */
  cardLink: string
  /** Sélecteur des onglets (role="tab" explicite dans le DOM) */
  tabSelector: string
  /** Texte visible de l'onglet "Passées" */
  tabPasseesLabel: string
  /** Texte visible de l'onglet "En cours" */
  tabEnCoursLabel: string
}

export const androidDemarchesLocators: DemarchesLocators = {
  cardContent:     '[role="tabpanel"] .fr-tile__content',
  cardTitle:       '.fr-tile__title',
  cardBadge:       '.fr-badge',
  cardLink:        'a[data-testid="request-item-link"]',
  tabSelector:     '[role="tab"]',
  tabPasseesLabel: 'Passées',
  tabEnCoursLabel: 'En cours',
}

export const iosDemarchesLocators: DemarchesLocators = {
  cardContent:     '[role="tabpanel"] .fr-tile__content',
  cardTitle:       '.fr-tile__title',
  cardBadge:       '.fr-badge',
  cardLink:        'a[data-testid="request-item-link"]',
  tabSelector:     '[role="tab"]',
  tabPasseesLabel: 'Passées',
  tabEnCoursLabel: 'En cours',
}

export function getDemarchesLocators(): DemarchesLocators {
  return driver.isIOS ? iosDemarchesLocators : androidDemarchesLocators
}
