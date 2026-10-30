import {roleSelector} from '../../../helpers/spa/selectors'

// Page hors de l'app AMI (« Mock Service Provider »), un seul jeu de sélecteurs.
export const fcDemoSpLocators = {
  /** Titre d'onglet de la page de connexion du démonstrateur. */
  loginPageTitle: 'Mock Service Provider',
  loginButton: roleSelector('button', 'Connexion à FranceConnect'),
  /** Consentement de FranceConnect quand une session FC est ouverte. */
  consentButton: 'button*=Continuer sur',
  /** Lien de la page « Login Callback » : déconnexion de FranceConnect. */
  logoutLink: roleSelector('link', 'Se déconnecter'),
}
