import {roleSelector} from '../../helpers/spa/selectors'

interface SuiviDemarchesLocators {
  pageTitle: string
  /** Le même titre en `role/heading`. « Mes démarches » est aussi un h2 de l'Accueil. */
  pageTitleHeading: string
  /** Titre h1 : le seul à ne pas exister sur l'Accueil. */
  pageTitleH1: string
  /** Titre de la page des démarches archivées. */
  archivedTitle: string
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
  /** Boutons attendus sur la page des archivées, avant de lire ses partenaires. */
  archivedExpectedButtons: string[]
  /** Boutons de la page des archivées qui ne sont pas des partenaires. */
  archivedIgnoredTexts: string[]
  /** Préfixe des boutons d'information, eux aussi ignorés. */
  archivedInfoPrefix: string
}

export const suiviDemarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  pageTitleHeading:          roleSelector('heading', 'Mes démarches'),
  pageTitleH1:               'h1*=Mes démarches',
  archivedTitle:             'Démarches archivées',
  demarcheTile:              (title: string): string => roleSelector('button', title),
  followButton:              roleSelector('button', 'Je veux suivre mes démarches'),
  archivedExpectedButtons:   ['AMI', 'Je veux suivre mes démarches'],
  archivedIgnoredTexts:      ['Retour à la page précédente', 'Je veux suivre mes démarches'],
  archivedInfoPrefix:        'Information',
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  archivedHelpAccordion:     'button*=Votre démarche n',
  archivedHelpAccordionCollapsed: '.fr-accordion__btn[aria-expanded="false"]',
}
