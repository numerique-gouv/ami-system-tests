import {roleSelector} from '../../helpers/selectors'

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
   * Bouton "Accéder à ma démarche" de la page de détail, par rôle + nom (`role/button[name=…]`, CONTRIBUTING §2).
   * Fallback documenté si le nom accessible s'avère instable : `#external-item-button`.
   */
  detailExternalButton: string
  /** Son nom, pour les messages d'échec. */
  detailExternalButtonName: string
}

export const demarcheDetailLocators: DemarcheDetailLocators = {
  detailExternalButton:      roleSelector('button', 'Accéder à ma démarche'),
  detailExternalButtonName:  'Accéder à ma démarche',
}

/** Locators partagés (WebView commune Android/iOS) — pas de dispatch plateforme nécessaire. */
export function getDemarcheDetailLocators(): DemarcheDetailLocators {
  return demarcheDetailLocators
}
