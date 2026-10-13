import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs WebView de la page de suivi des démarches (liste).
 * Les sélecteurs de la page de détail sont dans `demarche-detail.locators.ts`.
 *
 */
export interface SuiviDemarchesLocators {
  /** Titre principal de la page **/
  pageTitle: string
  /** Le même titre, comme sélecteur `role/heading` (sondes de présence). */
  pageTitleHeading: string
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
}

export const demarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  pageTitleHeading:          roleSelector('heading', 'Mes démarches'),
  demarcheTile:              (title: string): string => roleSelector('button', title),
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  archivedHelpAccordion:     'button*=Votre démarche n',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getSuiviDemarchesLocators(): SuiviDemarchesLocators {
  return demarchesLocators
}
