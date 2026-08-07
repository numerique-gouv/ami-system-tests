import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs WebView de la page "Mon profil" (SPA Svelte, route /#/profile).
 *
 * Structure DOM observée via just inspect (2026-08-04) et src/lib/components/NavWithBackButton.svelte
 * (dépôt ami-notifications-api, public/mobile-app) :
 *   button "Plus" (accessible name)     ← bouton avatar (initiales) dans le header home ;
 *                                          l'ancien data-testid="toggle-menu-button" n'existe plus
 *   [data-testid="profile-button"]      ← "Mon profil" dans le menu déroulant avatar
 *   <h2>Mon profil</h2>                 ← titre de la page, rendu par NavWithBackButton — sentinelle
 *                                          d'arrivée (le conteneur [data-testid="profile"] existe
 *                                          toujours dans le DOM mais n'est plus utilisé comme sélecteur)
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
  toggleMenuButton: Locator   // bouton Plus (3 petits points)
  identitySection: Locator    // section "Mon identité"
  emailSection: Locator       // section "Contact"
  addressSection: Locator     // section "Mon adresse"

  // Titre <h2> de la page (NavWithBackButton) — sentinelle d'arrivée par requête sémantique
  // (tl().findByRole('heading', {name: pageTitle})), plutôt qu'un data-testid sur le conteneur.
  pageTitle: string

  // DETTE : data-testid non justifié pour ces 2 champs. Choisi à l'origine (commit 09e9798)
  // parce que c'est le premier attribut remonté par `just inspect`, pas parce qu'un
  // tl().findByRole()/findByText() aurait été essayé et aurait échoué — "ce que just inspect
  // montre en premier" n'est pas une raison valable (cf. CONTRIBUTING.md §2 "data-testid : dernier
  // recours documenté"). À retester avec une query sémantique avant de considérer ce champ comme figé.
  profileMenuButtonTestId: string  // "Mon profil" dans le menu avatar
  settingsMenuButtonTestId: string // "Paramètres" dans le menu avatar

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
  toggleMenuButton: 'button=Plus',
  identitySection: '#profile-identity',
  emailSection: '#profile-email',
  addressSection: '#profile-address',

  pageTitle: 'Mon profil',
  profileMenuButtonTestId: 'profile-button',
  settingsMenuButtonTestId: 'settings-button',
  preferredUsernameEditButtonTestId: 'preferred-username-button',
  emailEditButtonTestId: 'email-button',
  addressEditButtonTestId: 'address-button',
  editContainerTestId: 'container',
  autocompleteFirstItemButtonTestId: 'autocomplete-item-button-0',
}

export function getProfileLocators(): ProfileLocators {
  return profileLocators
}
