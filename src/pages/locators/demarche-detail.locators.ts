import {roleSelector} from '../../helpers/spa/selectors'

interface DemarcheDetailLocators {
  /** Libellé qui n'existe que sur le détail : le titre est aussi dans la liste du Suivi, affichée un instant après le clic. */
  referenceLabel: string
  /** « Accéder à ma démarche » (`#external-item-button`, sans href : la navigation vers l'URL partenaire se fait en JS et remplace l'URL de la WebView). */
  detailExternalButton: string
  /** Son nom, pour les messages d'échec. */
  detailExternalButtonName: string
}

export const demarcheDetailLocators: DemarcheDetailLocators = {
  referenceLabel:            'référence dossier',
  detailExternalButton:      roleSelector('button', 'Accéder à ma démarche'),
  detailExternalButtonName:  'Accéder à ma démarche',
}
