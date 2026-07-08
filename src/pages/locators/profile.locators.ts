import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs WebView de la page "Mon profil" (SPA Svelte, route /#/profile).
 *
 * Structure DOM observée via just inspect (2026-06-29) :
 *   [data-testid="toggle-menu-button"]  ← bouton avatar (initiales) dans le header home
 *   [data-testid="profile-button"]      ← "Mon profil" dans le menu déroulant avatar
 *   [data-testid="profile"]             ← conteneur principal de la page profil
 *     #profile-identity                 ← section "Mon identité" (nom, date/lieu de naissance)
 *     #profile-email                    ← section "Contact" (email)
 *     #profile-address                  ← section "Mon adresse" (rue, code postal)
 *
 * Toute la page est dans la WebView SPA — sélecteurs CSS identiques iOS et Android.
 */
export interface ProfileLocators {
  toggleMenuButton: Locator   // bouton avatar (initiales) — ouvre le menu utilisateur
  profileMenuButton: Locator  // "Mon profil" dans le menu avatar
  settingsMenuButton: Locator // "Paramètres" dans le menu avatar
  profileContainer: Locator   // conteneur de la page profil
  identitySection: Locator    // section "Mon identité"
  emailSection: Locator       // section "Contact"
  addressSection: Locator     // section "Mon adresse"
  // Boutons "Modifier" dans la page profil (data-testid requis : les 3 boutons ont le même texte)
  preferredUsernameEditButton: Locator // [data-testid="preferred-username-button"]
  emailEditButton: Locator             // [data-testid="email-button"]
  addressEditButton: Locator           // [data-testid="address-button"]
  // Sentinelle de navigation — les pages d'édition partagent [data-testid="container"]
  editContainer: Locator               // [data-testid="container"]
  // Premier item d'autocomplétion BAN (texte imprévisible → data-testid)
  autocompleteFirstItemButton: Locator // [data-testid="autocomplete-item-button-0"]
}

export const profileLocators: ProfileLocators = {
  toggleMenuButton: '[data-testid="toggle-menu-button"]',
  profileMenuButton: '[data-testid="profile-button"]',
  settingsMenuButton: '[data-testid="settings-button"]',
  profileContainer: '[data-testid="profile"]',
  identitySection: '#profile-identity',
  emailSection: '#profile-email',
  addressSection: '#profile-address',
  preferredUsernameEditButton: '[data-testid="preferred-username-button"]',
  emailEditButton: '[data-testid="email-button"]',
  addressEditButton: '[data-testid="address-button"]',
  editContainer: '[data-testid="container"]',
  autocompleteFirstItemButton: '[data-testid="autocomplete-item-button-0"]',
}

export function getProfileLocators(): ProfileLocators {
  return profileLocators
}
