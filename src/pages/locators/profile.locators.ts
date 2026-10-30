import type { Locator } from './types'
import {roleSelector} from '../../helpers/spa/selectors'

/**
 * Profil (SPA) : un hub `/#/profile` (menu « Mon identité », « Mes coordonnées »), deux sous-pages `/#/profile/identity` et
 * `/#/profile/addresses`, et leurs formulaires d'édition. Sélecteurs identiques sur iOS, Android et webapp.
 * Seul `pageTitle` est un nom (pour `waitForHeading`), les autres valeurs sont des sélecteurs WDIO 10.
 */
interface ProfileLocators {
  identitySection: Locator
  emailSection: Locator
  addressSection: Locator

  identityMenuButton: Locator
  contactMenuButton: Locator
  hubHeading: Locator

  pageTitle: string
  /** Texte CONTIENT : l'espace insécable de « Où habitez-vous&nbsp;? » est normalisée différemment selon le moteur. */
  addressFormHeading: Locator

  // Les data-testid ci-dessous ne sont pas justifiés par un échec de requête par rôle : à retester avec `role/…`.
  profileMenuButton: Locator

  // Les 3 boutons « Modifier » ont le même rôle et le même texte : data-testid est la seule option.
  preferredUsernameEditButton: Locator
  emailEditButton: Locator
  addressEditButton: Locator

  // `aria/<libellé>` ne convient plus : le <label> contient un indice et `aria/` compare le nom accessible en entier.
  preferredUsernameInput: Locator
  emailInput: Locator
  addressInput: Locator
  // Texte imprévisible : dépend de la réponse de l'API BAN.
  autocompleteFirstItem: Locator

  logoutButton: Locator
  /** Titre de la modale de confirmation de suppression des données, et son bouton « Confirmer ». */
  deletionHeading: Locator
  confirmButton: Locator
  cancelButton: Locator
  saveButton: Locator
  /** Les valeurs affichées en gras d'une section. */
  boldIn: (section: Locator) => Locator
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
  addressFormHeading: 'h1*=Où habitez-vous',
  profileMenuButton: testId('profile-button'),
  preferredUsernameEditButton: testId('preferred-username-button'),
  emailEditButton: testId('email-button'),
  addressEditButton: testId('address-button'),
  preferredUsernameInput: testId('preferred-username-input'),
  emailInput: testId('email-input'),
  addressInput: testId('address-input'),
  autocompleteFirstItem: testId('autocomplete-item-button-0'),

  logoutButton: roleSelector('button', 'Me déconnecter'),
  deletionHeading: roleSelector('heading', 'Suppression de vos données'),
  confirmButton: roleSelector('button', 'Confirmer'),
  cancelButton: roleSelector('button', 'Annuler'),
  saveButton: roleSelector('button', 'Enregistrer'),
  boldIn: (section: Locator): Locator => `${section} b`,
}
