import type { Locator } from './types'
import {roleSelector} from '../../helpers/selectors'

/**
 * Sélecteurs WebView de la page "Mon profil" (SPA Svelte, route /#/profile) et de ses formulaires d'édition.
 * Sources : src/lib/components/NavWithBackButton.svelte et les pages routes/edit-address, edit-email et edit-preferred-username (dépôt ami-notifications-api,
 * public/mobile-app) ; relevés en live sur staging.
 *
 *   button "Plus" (nom accessible)      ← bouton avatar dans le header home, ouvert par NavigationPage.openPlusMenu()
 *   [data-testid="profile-button"]      ← "Mon profil" dans le menu déroulant avatar
 *   <h1>Mon profil</h1>                 ← titre de la page (NavWithBackButton) — sentinelle d'arrivée
 *     #profile-identity / #profile-email / #profile-address   ← sections « Mon identité », « Contact », « Mon adresse »
 *
 * Toute la page est dans la WebView SPA — sélecteurs identiques iOS et Android.
 * Chaque valeur est un sélecteur WDIO 10 prêt à l'emploi : CSS, `[data-testid=…]`, `role/…[name=…]`, `aria/<libellé>` (champ
 * associé à un <label>) ou `tag*=texte` (texte contient). Seul `pageTitle` est un NOM (pour `waitForHeading`).
 */
export interface ProfileLocators {
  identitySection: Locator    // section "Mon identité"
  emailSection: Locator       // section "Contact"
  addressSection: Locator     // section "Mon adresse"

  /** Nom du titre <h1> de la page (NavWithBackButton) — sentinelle d'arrivée (`waitForHeading`). */
  pageTitle: string
  identityHeading: Locator
  contactHeading: Locator
  /**
   * Titre « Où habitez-vous&nbsp;? » : texte CONTIENT, car l'espace insécable (&nbsp;) est normalisée différemment dans le
   * nom accessible selon le moteur (Chrome en BiDi, script de WDIO sur mobile). Rendu par NavWithBackButton : <h1> (relevé dans les sources le 2026-10-13).
   */
  addressFormHeading: Locator

  // DETTE : data-testid non justifié pour ces champs. Choisi à l'origine parce que c'est le premier attribut remonté par
  // l'inspection, pas parce qu'une requête par rôle aurait échoué (cf. CONTRIBUTING.md §2 "data-testid : dernier recours
  // documenté"). À retester avec `role/…` avant de considérer ce champ comme figé.
  profileMenuButton: Locator   // "Mon profil" dans le menu avatar
  settingsMenuButton: Locator  // "Paramètres" dans le menu avatar

  // Ambiguïté CONFIRMÉE : les 3 boutons "Modifier" de la page profil partagent le même rôle (button) et le même texte
  // visible — data-testid est ici la seule option (pas un choix de confort).
  preferredUsernameEditButton: Locator
  emailEditButton: Locator
  addressEditButton: Locator

  /** Champs des formulaires d'édition, par leur libellé (`<label for>`). */
  preferredUsernameInput: Locator
  emailInput: Locator
  addressInput: Locator
  // Texte imprévisible CONFIRMÉ : dépend de la réponse de l'API BAN, connu seulement à l'exécution — aucune requête par
  // nom accessible n'est possible par construction.
  autocompleteFirstItem: Locator

  logoutButton: Locator
  /** Titre de la modale de confirmation de la suppression des données, et son bouton « Confirmer ». */
  deletionHeading: Locator
  confirmButton: Locator
}

const testId = (id: string): Locator => `[data-testid="${id}"]`

export const profileLocators: ProfileLocators = {
  identitySection: '#profile-identity',
  emailSection: '#profile-email',
  addressSection: '#profile-address',

  pageTitle: 'Mon profil',
  identityHeading: roleSelector('heading', 'Mon identité'),
  contactHeading: roleSelector('heading', 'Contact'),
  addressFormHeading: 'h1*=Où habitez-vous',
  profileMenuButton: testId('profile-button'),
  settingsMenuButton: testId('settings-button'),
  preferredUsernameEditButton: testId('preferred-username-button'),
  emailEditButton: testId('email-button'),
  addressEditButton: testId('address-button'),
  preferredUsernameInput: 'aria/Nom d’usage',
  emailInput: 'aria/E-mail',
  addressInput: 'aria/Adresse',
  autocompleteFirstItem: testId('autocomplete-item-button-0'),

  logoutButton: roleSelector('button', 'Me déconnecter'),
  deletionHeading: roleSelector('heading', 'Suppression de vos données'),
  confirmButton: roleSelector('button', 'Confirmer'),
}

export function getProfileLocators(): ProfileLocators {
  return profileLocators
}
