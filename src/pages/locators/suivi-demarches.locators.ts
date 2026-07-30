/**
 * Sélecteurs WebView de la page de suivi des démarches (liste).
 * Les sélecteurs de la page de détail sont dans `demarche-detail.locators.ts`.
 *
 * Structure DOM (DSFR fr-tile, Svelte) observée via `just inspect` (2026-06-26) :
 *
 *   Liste (/#/followup) :
 *   .fr-tile__content                          ← conteneur d'une carte (PAS scopé dans un [role="tabpanel"])
 *     .fr-tile__title
 *       a[...]                                 ← titre + navigation vers la page de détail (route interne) ;
 *                                                  nom accessible = titre affiché, ciblé via tl().findByRole('link', {name})
 *                                                  dans `ouvreDemarche` (pas de data-testid) ; MAIS lu via
 *                                                  card.$(loc.cardTitle).getText() dans `assertVisibleDemarcheWith`
 *                                                  (cf. note `tl()` vs `$()` sur ce champ, plus bas)
 *     .fr-tile__start
 *       .fr-badge                              ← libellé de statut (ex. "Brouillon", "Terminé")
 *
 * Note : l'app n'utilise pas [role="tabpanel"]. Les onglets filtrent via CSS/état Svelte.
 * Chercher dans TOUS les .fr-tile__content ; le filtre par titre (unique via timestamp) évite
 * les faux positifs entre cartes "En cours" et "Passées".
 */

export interface SuiviDemarchesLocators {
  /** Titre principal de la page **/
  pageTitle: string
  /** Conteneurs de carte scopés au tabpanel actif */
  cardContent: string
  /** Titre visible dans une carte (peut contenir un <a>, peut ne pas en avoir) */
  cardTitle: string
  /** Badge de statut dans une carte */
  cardBadge: string
  /** Sélecteur des onglets (role="tab" explicite dans le DOM) */
  tabSelector: string
}

export const demarchesLocators: SuiviDemarchesLocators = {
  pageTitle:                 'Mes démarches',
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  tabSelector:               '[role="tab"]',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getSuiviDemarchesLocators(): SuiviDemarchesLocators {
  return demarchesLocators
}
