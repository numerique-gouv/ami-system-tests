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
  /** Affiché tant qu'aucun consentement n'est actif. */
  followButton: string
  /** Bouton d'options de la tuile d'une démarche (ouvre la modale qui propose « Archiver »). */
  optionsButton: (title: string) => string
  /** « Archiver » dans la modale d'options de la démarche. */
  archiveButton: (title: string) => string
}

export const suiviDemarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  pageTitleHeading:          roleSelector('heading', 'Mes démarches'),
  pageTitleH1:               'h1*=Mes démarches',
  archivedTitle:             'Démarches archivées',
  demarcheTile:              (title: string): string => roleSelector('button', title),
  followButton:              roleSelector('button', 'Je veux suivre mes démarches'),
  optionsButton:             (title: string): string => roleSelector('button', `Ouvrir les options pour ${title}`),
  archiveButton:             (title: string): string => roleSelector('button', `Archiver l'élément ${title}`),
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
}
