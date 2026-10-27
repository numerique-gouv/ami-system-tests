import {roleSelector} from '../../helpers/spa/selectors'

/**
 * Sélecteurs de la navigation principale de la SPA (barre basse + menu « Plus »).
 *
 * WebView/webapp, DOM identique : un seul jeu (pas de getXxxLocators()). Tout est exposé en
 * <button> avec un nom accessible — aucun <a href> interne (vérifié en live le 2026-10-02) —
 * donc ciblage par `role/button[name=…]` (WDIO 10, `roleSelector`, CONTRIBUTING.md §2).
 *
 * Le menu « Plus » est un <dialog> DSFR titré « La suite de la navigation » ; fermé, ses boutons
 * sont masqués et donc ignorés par `firstDisplayed` (seuls les éléments affichés sont retenus).
 */
export type TabName = 'Accueil' | 'Agenda' | 'Services' | 'Suivi'

export type PlusEntry =
  | 'Mon profil'
  | 'Préférences'
  | 'Aide et contact'
  | 'Données personnelles et sécurité'
  | 'Accessibilité'

/** Le menu « Plus » est un <dialog> DSFR nommé par son titre (aria-labelledby), ouvert ⇔ classe `fr-modal--opened`. */
const PLUS_DIALOG_OPENED = 'dialog[id^="modal-main-nav-plus"].fr-modal--opened'

export const navigationLocators = {
  /** Barre basse : <nav aria-label="Menu principal"> ; ses boutons se cherchent DANS elle (`within`). */
  bottomBar: roleSelector('navigation', 'Menu principal'),
  tab: (tab: TabName | 'Plus'): string => roleSelector('button', tab),
  /** Le dialogue « Plus » ; ses entrées se cherchent DANS lui (`within`). */
  plusDialog: roleSelector('dialog', 'La suite de la navigation'),
  plusEntry: (entry: PlusEntry): string => roleSelector('button', entry),
  anyButton: roleSelector('button'),
  /** CSS (classes DSFR, contrat stable) : dialogue ouvert, et son bouton « Fermer » (aria-label). */
  plusDialogOpened: PLUS_DIALOG_OPENED,
  plusDialogClose: `${PLUS_DIALOG_OPENED} button[aria-label="Fermer"]`,
  back: roleSelector('button', 'Retour à la page précédente'),
}
