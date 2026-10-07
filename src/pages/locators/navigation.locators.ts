/**
 * Sélecteurs de la navigation principale de la SPA (barre basse + menu « Plus »).
 *
 * WebView/webapp, DOM identique : un seul jeu (pas de getXxxLocators()). Tout est exposé en
 * <button> avec un nom accessible — aucun <a href> interne (vérifié en live le 2026-10-02) —
 * donc ciblage par `findRole('button', name)` (CONTRIBUTING.md §2).
 *
 * Le menu « Plus » est un <dialog> DSFR titré « La suite de la navigation » ; fermé, ses boutons
 * sont masqués et donc ignorés par `findRole` (éléments non accessibles exclus).
 */
export type TabName = 'Accueil' | 'Agenda' | 'Services' | 'Suivi'

export type PlusEntry =
  | 'Mon profil'
  | 'Préférences'
  | 'Aide et contact'
  | 'Données personnelles et sécurité'
  | 'Accessibilité'

export interface NavigationLocators {
  plusButtonName: string
  plusDialogHeading: string
  /** Nom accessible de la barre de navigation basse. */
  bottomBarName: string
}

export const navigationLocators: NavigationLocators = {
  plusButtonName: 'Plus',
  plusDialogHeading: 'La suite de la navigation',
  bottomBarName: 'Menu principal',
}
