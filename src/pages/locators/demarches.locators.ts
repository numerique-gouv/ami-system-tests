/**
 * Sélecteurs WebView de la page de suivi des démarches.
 *
 * Structure DOM (DSFR fr-tile, Svelte) observée via `just inspect` (2026-06-26) :
 *   .fr-tile__content                     ← conteneur d'une carte (PAS scopé dans un [role="tabpanel"])
 *     .fr-tile__title
 *       a[data-testid="request-item-link"] ← titre + lien externe (textContent = titre affiché)
 *     .fr-tile__start
 *       .fr-badge                          ← libellé de statut (ex. "Brouillon", "Terminé")
 *
 * Note : l'app n'utilise pas [role="tabpanel"]. Les onglets filtrent via CSS/état Svelte.
 * Chercher dans TOUS les .fr-tile__content ; le filtre par titre (unique via timestamp) évite
 * les faux positifs entre cartes "En cours" et "Passées".
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
  cardContent:     '.fr-tile__content',
  cardTitle:       '.fr-tile__title',
  cardBadge:       '.fr-badge',
  cardLink:        'a[data-testid="request-item-link"]',
  tabSelector:     '[role="tab"]',
  tabPasseesLabel: 'Passées',
  tabEnCoursLabel: 'En cours',
}

export const iosDemarchesLocators: DemarchesLocators = {
  cardContent:     '.fr-tile__content',
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
