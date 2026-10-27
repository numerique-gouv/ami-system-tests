import type { Locator } from './types'
import {roleSelector} from '../../helpers/spa/selectors'

/**
 * Sélecteurs WebView du profil (SPA Svelte) : un **hub** `/#/profile` (menu latéral « Mon identité », « Mes coordonnées »,
 * « Ma commune »), deux sous-pages `/#/profile/identity` et `/#/profile/addresses`, et leurs formulaires d'édition
 * (`/#/profile/identity/edit-preferred-username`, `/#/profile/addresses/edit-email`, `/#/profile/addresses/edit-address`).
 * Hub + sous-pages relevés en live sur staging le 2026-10-26 (avant : une seule page `/#/profile` portant les trois blocs et
 * des routes `/edit-*` à la racine, devenues des pages d'erreur) ; code lu sur `origin/main` d'ami-notifications-api
 * (public/mobile-app/src/routes/profile/**). « Ma commune » est désactivé tant qu'aucune mairie n'est trouvée pour l'adresse.
 * Enregistrer / Annuler d'un formulaire = `AMIBack` : retour à la page précédente de l'historique (la sous-page si on y est
 * venu par un clic), `/#/profile` à défaut.
 *
 *   button "Plus" (nom accessible)      ← bouton avatar dans le header home, ouvert par NavigationPage.openPlusMenu()
 *   [data-testid="profile-button"]      ← "Mon profil" dans le menu déroulant avatar
 *   <h1>Mon profil</h1>                 ← titre du hub (NavWithBackButton) — sentinelle d'arrivée
 *   #profile-identity                   ← sous-page « Mon identité »
 *   #profile-email / #profile-address   ← sous-page « Mes coordonnées » : blocs « Contact » et « Mon adresse »
 *
 * Toute la page est dans la WebView SPA — sélecteurs identiques iOS et Android.
 * Chaque valeur est un sélecteur WDIO 10 prêt à l'emploi : CSS, `[data-testid=…]`, `role/…[name=…]`, `aria/<libellé>` (champ
 * associé à un <label>) ou `tag*=texte` (texte contient). Seul `pageTitle` est un NOM (pour `waitForHeading`).
 */
export interface ProfileLocators {
  identitySection: Locator    // sous-page « Mon identité » (/#/profile/identity)
  emailSection: Locator       // bloc "Contact" de la sous-page « Mes coordonnées » (/#/profile/addresses)
  addressSection: Locator     // bloc "Mon adresse" de la même sous-page

  /** Entrées du menu latéral du hub : boutons de nom exact (un seul de chaque sur le hub). */
  identityMenuButton: Locator
  contactMenuButton: Locator
  /** Titre du hub (<h1> « Mon profil ») : sonde « suis-je sur le hub ? » (le nom `pageTitle` sert à `waitForHeading`). */
  hubHeading: Locator

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

  /** Champs des formulaires d'édition (data-testid : cf. commentaire des valeurs). */
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
  identityMenuButton: roleSelector('button', 'Mon identité'),
  contactMenuButton: roleSelector('button', 'Mes coordonnées'),
  hubHeading: roleSelector('heading', 'Mon profil'),
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
  // `aria/<libellé>` ne trouve plus ces champs (relevé 2026-10-26, staging : « Aucun élément affiché pour aria/Nom d’usage ») :
  // le libellé du <label> contient désormais un indice (« Nom d’usage Par exemple : Dupont »), or `aria/` compare le nom
  // accessible en entier. L'`id` du champ (`input`) est partagé par les formulaires et il n'a ni `name` : data-testid.
  preferredUsernameInput: testId('preferred-username-input'),
  emailInput: testId('email-input'),
  addressInput: testId('address-input'),
  autocompleteFirstItem: testId('autocomplete-item-button-0'),

  logoutButton: roleSelector('button', 'Me déconnecter'),
  deletionHeading: roleSelector('heading', 'Suppression de vos données'),
  confirmButton: roleSelector('button', 'Confirmer'),
}

export function getProfileLocators(): ProfileLocators {
  return profileLocators
}
