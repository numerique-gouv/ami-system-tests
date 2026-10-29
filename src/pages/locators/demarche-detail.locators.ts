import {roleSelector} from '../../helpers/spa/selectors'

interface DemarcheDetailLocators {
  /** « Accéder à ma démarche » (`#external-item-button`, sans href : la navigation vers l'URL partenaire se fait en JS et remplace l'URL de la WebView). */
  detailExternalButton: string
  /** Son nom, pour les messages d'échec. */
  detailExternalButtonName: string
}

export const demarcheDetailLocators: DemarcheDetailLocators = {
  detailExternalButton:      roleSelector('button', 'Accéder à ma démarche'),
  detailExternalButtonName:  'Accéder à ma démarche',
}
