import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs WebView de la page de suivi des démarches (liste).
 * Les sélecteurs de la page de détail sont dans `demarche-detail.locators.ts`.
 *
 */
export interface SuiviDemarchesLocators {
  /** Titre principal de la page **/
  pageTitle: string
  /** Le même titre, comme sélecteur `role/heading` (sondes de présence). Attention : « Mes démarches » est AUSSI un titre h2 de l'Accueil. */
  pageTitleHeading: string
  /** Titre h1 de la page Suivi : le seul à ne pas exister sur l'Accueil (h2). Relevé en live le 2026-10-15. */
  pageTitleH1: string
  /** Tuile d'une démarche : bouton dont le nom accessible est son titre (unique, horodaté). */
  demarcheTile: (title: string) => string
  /** Conteneurs de carte scopés au tabpanel actif */
  cardContent: string
  /** Titre visible dans une carte (peut contenir un <a>, peut ne pas en avoir) */
  cardTitle: string
  /** Badge de statut dans une carte */
  cardBadge: string
  /** Accordéon « Votre démarche n’apparaît pas ? » de la page des archivées (texte visible contient ; apostrophe évitée). */
  archivedHelpAccordion: string
  /** Bouton affiché tant qu'aucun consentement n'est actif (relevé en live le 2026-10-15). */
  followButton: string
}

export const demarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  pageTitleHeading:          roleSelector('heading', 'Mes démarches'),
  pageTitleH1:               'h1*=Mes démarches',
  demarcheTile:              (title: string): string => roleSelector('button', title),
  followButton:              roleSelector('button', 'Je veux suivre mes démarches'),
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  archivedHelpAccordion:     'button*=Votre démarche n',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getSuiviDemarchesLocators(): SuiviDemarchesLocators {
  return demarchesLocators
}
