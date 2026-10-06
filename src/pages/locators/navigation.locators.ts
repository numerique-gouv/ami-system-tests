/**
 * Sélecteurs de la navigation principale de la SPA (barre basse + menu « Plus »).
 *
 * WebView/webapp, DOM identique : un seul jeu (pas de getXxxLocators()). Tout est exposé en
 * <button> avec un nom accessible — aucun <a href> interne (vérifié en live le 2026-10-02) —
 * donc ciblage par `tl().findByRole('button', {name})` (CONTRIBUTING.md §2).
 *
 * Le menu « Plus » est un <dialog> DSFR titré « La suite de la navigation » ; fermé, ses boutons
 * sont masqués et donc ignorés par Testing Library (hidden: false par défaut).
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
  /** Titre (heading) de la page atteinte depuis chaque entrée du menu Plus. */
  plusEntryHeading: Record<PlusEntry, string>
  /** Fragment de hash attendu après navigation. */
  plusEntryHash: Record<PlusEntry, RegExp>
  tabHeading: Record<TabName, string | RegExp>
}

export const navigationLocators: NavigationLocators = {
  plusButtonName: 'Plus',
  plusDialogHeading: 'La suite de la navigation',
  plusEntryHeading: {
    'Mon profil': 'Mon profil',
    'Préférences': 'Préférences',
    'Aide et contact': 'Aide et contact',
    'Données personnelles et sécurité': 'Données personnelles et sécurité',
    'Accessibilité': 'Accessibilité',
  },
  plusEntryHash: {
    'Mon profil': /#\/profile$/,
    'Préférences': /#\/preferences$/,
    'Aide et contact': /#\/help-center$/,
    'Données personnelles et sécurité': /#\/page\/donnees-personnelles$/,
    'Accessibilité': /#\/page\/accessibilite$/,
  },
  tabHeading: {
    Accueil: /^Bonjour /,
    Agenda: 'Mon agenda',
    Services: 'Services',
    Suivi: 'Mes démarches',
  },
}
