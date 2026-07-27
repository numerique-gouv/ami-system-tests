/**
 * Sélecteurs WebView de la page de suivi des démarches et de sa page de détail.
 *
 * Structure DOM (DSFR fr-tile, Svelte) observée via `just inspect` (2026-06-26, liste) et
 * (2026-07-27, détail) :
 *
 *   Liste (/#/followup) :
 *   .fr-tile__content                          ← conteneur d'une carte (PAS scopé dans un [role="tabpanel"])
 *     .fr-tile__title
 *       a[...]                                 ← titre + navigation vers la page de détail (route interne) ;
 *                                                  nom accessible = titre affiché, ciblé via tl().findByRole('link', {name})
 *                                                  dans le PO, pas de data-testid (cf. demarches.page.ts `ouvreDemarche`)
 *     .fr-tile__start
 *       .fr-badge                              ← libellé de statut (ex. "Brouillon", "Terminé")
 *
 *   Détail (/#/followup/item/dinum-ami/OTV/<itemId>) :
 *   <h1>                                        ← titre
 *   button#external-item-button                 ← nom accessible "Accéder à ma démarche", sans href ;
 *                                                  la navigation vers l'URL partenaire se fait en JS et
 *                                                  remplace l'URL de la WebView courante
 *   .demarche--events                           ← liste des événements
 *   button[data-testid="back-button"]           ← nom accessible "Retour à la page précédente"
 *
 * Note : l'app n'utilise pas [role="tabpanel"]. Les onglets filtrent via CSS/état Svelte.
 * Chercher dans TOUS les .fr-tile__content ; le filtre par titre (unique via timestamp) évite
 * les faux positifs entre cartes "En cours" et "Passées".
 */

export interface DemarchesLocators {
  /** Conteneurs de carte scopés au tabpanel actif */
  cardContent: string
  /** Titre visible dans une carte (peut contenir un <a>, peut ne pas en avoir) */
  cardTitle: string
  /** Badge de statut dans une carte */
  cardBadge: string
  /** Sélecteur des onglets (role="tab" explicite dans le DOM) */
  tabSelector: string
  /**
   * Nom accessible du bouton "Accéder à ma démarche" sur la page de détail.
   * Sélectionné par rôle+nom via `tl().getByRole('button', { name: ... })` dans le PO
   * (CONTRIBUTING §2 : sélecteur sémantique avant data-testid). Fallback documenté si le nom
   * accessible s'avère instable : `#external-item-button`.
   */
  detailExternalButtonName: string
  /**
   * Nom accessible du bouton de retour sur la page de détail.
   * Sélectionné par rôle+nom via `tl().getByRole('button', { name: ... })` dans le PO.
   * Fallback documenté : `[data-testid="back-button"]`.
   */
  detailBackButtonName: string
}

export const demarchesLocators: DemarchesLocators = {
  cardContent:               '.fr-tile__content',
  cardTitle:                 '.fr-tile__title',
  cardBadge:                 '.fr-badge',
  tabSelector:               '[role="tab"]',
  detailExternalButtonName:  'Accéder à ma démarche',
  detailBackButtonName:      'Retour à la page précédente',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getDemarchesLocators(): DemarchesLocators {
  return demarchesLocators
}
