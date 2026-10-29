import {roleSelector} from '../../helpers/spa/selectors'

export interface SuiviDemarchesLocators {
  pageTitle: string
  /** Le même titre en `role/heading`. « Mes démarches » est aussi un h2 de l'Accueil. */
  pageTitleHeading: string
  /** Titre h1 : le seul à ne pas exister sur l'Accueil. */
  pageTitleH1: string
  /** Tuile d'une démarche : bouton dont le nom accessible est son titre (unique, horodaté). */
  demarcheTile: (title: string) => string
  cardContent: string
  cardTitle: string
  cardBadge: string
  /** Accordéon « Votre démarche n’apparaît pas ? » des archivées (apostrophe évitée). */
  archivedHelpAccordion: string
  /** Le même accordéon replié (`aria-expanded="false"`). */
  archivedHelpAccordionCollapsed: string
  /** Affiché tant qu'aucun consentement n'est actif. */
  followButton: string
}

const demarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  pageTitleHeading:          roleSelector('heading', 'Mes démarches'),
  pageTitleH1:               'h1*=Mes démarches',
  demarcheTile:              (title: string): string => roleSelector('button', title),
  followButton:              roleSelector('button', 'Je veux suivre mes démarches'),
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  archivedHelpAccordion:     'button*=Votre démarche n',
  archivedHelpAccordionCollapsed: '.fr-accordion__btn[aria-expanded="false"]',
}

export function getSuiviDemarchesLocators(): SuiviDemarchesLocators {
  return demarchesLocators
}
