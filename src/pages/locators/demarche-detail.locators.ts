/**
 * Sélecteurs WebView de la page de détail d'une démarche.
 *
 * Structure DOM (DSFR, Svelte) observée via `just inspect` (2026-07-27) :
 *
 *   Détail (/#/followup/item/dinum-ami/OTV/<itemId>) :
 *   <h1>                                        ← titre
 *   button#external-item-button                 ← nom accessible "Accéder à ma démarche", sans href ;
 *                                                  la navigation vers l'URL partenaire se fait en JS et
 *                                                  remplace l'URL de la WebView courante
 *   .demarche--events                           ← liste des événements
 *   button[data-testid="back-button"]           ← nom accessible "Retour à la page précédente"
 */

export interface DemarcheDetailLocators {
  /**
   * Nom accessible du bouton "Accéder à ma démarche" sur la page de détail.
   * Sélectionné par rôle+nom via `tl().getByRole('button', { name: ... })` dans le PO
   * (CONTRIBUTING §2 : sélecteur sémantique avant data-testid). Fallback documenté si le nom
   * accessible s'avère instable : `#external-item-button`.
   */
  detailExternalButtonName: string
}

export const demarcheDetailLocators: DemarcheDetailLocators = {
  detailExternalButtonName:  'Accéder à ma démarche',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getDemarcheDetailLocators(): DemarcheDetailLocators {
  return demarcheDetailLocators
}
