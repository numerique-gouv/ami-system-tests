import {roleSelector} from '../../helpers/spa/selectors'

export type TabName = 'Accueil' | 'Agenda' | 'Services' | 'Suivi'

export type PlusEntry =
  | 'Mon profil'
  | 'Préférences'
  | 'Aide et contact'
  | 'Données personnelles et sécurité'
  | 'Accessibilité'

/** Le menu « Plus » est un <dialog> DSFR, ouvert quand il porte la classe `fr-modal--opened`. */
const PLUS_DIALOG_OPENED = 'dialog[id^="modal-main-nav-plus"].fr-modal--opened'

export const navigationLocators = {
  /** Les boutons de la barre basse se cherchent dans elle (`within`). */
  bottomBar: roleSelector('navigation', 'Menu principal'),
  tab: (tab: TabName | 'Plus'): string => roleSelector('button', tab),
  /** Les entrées du menu « Plus » se cherchent dans lui (`within`). */
  plusDialog: roleSelector('dialog', 'La suite de la navigation'),
  plusEntry: (entry: PlusEntry): string => roleSelector('button', entry),
  plusDialogOpened: PLUS_DIALOG_OPENED,
  plusDialogClose: `${PLUS_DIALOG_OPENED} button[aria-label="Fermer"]`,
  back: roleSelector('button', 'Retour à la page précédente'),
}
