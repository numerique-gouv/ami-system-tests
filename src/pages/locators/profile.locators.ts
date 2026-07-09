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
 *
 * Deux formats de valeur cohabitent selon le consommateur :
 *   Locator (CSS)  — pour $()/$$()/driver.execute(document.querySelector(...))
 *   string (id nu) — pour tl().findByTestId(), qui attend la valeur brute de
 *                     l'attribut data-testid, pas un sélecteur CSS
 */
export interface ProfileLocators {
  toggleMenuButton: Locator   // bouton avatar (initiales) — ouvre le menu utilisateur
  identitySection: Locator    // section "Mon identité"
  emailSection: Locator       // section "Contact"
  addressSection: Locator     // section "Mon adresse"

  // DETTE : data-testid non justifié pour ces 3 champs. Choisi à l'origine (commit 09e9798)
  // parce que c'est le premier attribut remonté par `just inspect`, pas parce qu'un
  // tl().findByRole()/findByText() aurait été essayé et aurait échoué — "ce que just inspect
  // montre en premier" n'est pas une raison valable (cf. CONTRIBUTING.md §2 "data-testid : dernier
  // recours documenté"). À retester avec une query sémantique avant de considérer ce champ comme figé.
  profileMenuButtonTestId: string  // "Mon profil" dans le menu avatar
  settingsMenuButtonTestId: string // "Paramètres" dans le menu avatar
  profileContainerTestId: string   // conteneur de la page profil

  // Ambiguïté CONFIRMÉE : les 3 boutons "Modifier" de la page profil partagent le même rôle
  // (button) et le même texte visible — tl().findByRole('button', {name:'Modifier'}) ne peut
  // pas les distinguer, data-testid est ici la seule option (pas un choix de confort).
  preferredUsernameEditButtonTestId: string
  emailEditButtonTestId: string
  addressEditButtonTestId: string
  // DETTE, même raison non justifiée que profileMenuButtonTestId ci-dessus.
  editContainerTestId: string
  // Texte imprévisible CONFIRMÉ : dépend de la réponse de l'API BAN, connu seulement à l'exécution
  // — aucune requête par nom accessible n'est possible par construction.
  autocompleteFirstItemButtonTestId: string
}

export const profileLocators: ProfileLocators = {
  toggleMenuButton: '[data-testid="toggle-menu-button"]',
  identitySection: '#profile-identity',
  emailSection: '#profile-email',
  addressSection: '#profile-address',

  profileMenuButtonTestId: 'profile-button',
  settingsMenuButtonTestId: 'settings-button',
  profileContainerTestId: 'profile',
  preferredUsernameEditButtonTestId: 'preferred-username-button',
  emailEditButtonTestId: 'email-button',
  addressEditButtonTestId: 'address-button',
  editContainerTestId: 'container',
  autocompleteFirstItemButtonTestId: 'autocomplete-item-button-0',
}

export function getProfileLocators(): ProfileLocators {
  return profileLocators
}
