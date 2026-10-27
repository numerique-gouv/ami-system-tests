import {roleSelector} from '../../../helpers/spa/selectors'

/**
 * Sélecteurs du fournisseur de service de démonstration FranceConnect (« Mock Service Provider », bac à sable), atteint depuis la
 * carte « Déconnexion FC » du catalogue de STAGING. Page hors de l'app AMI, hors de notre contrôle. Relevé en live le 2026-10-15
 * (snapshot d'accessibilité) ; WebView/webapp, un seul jeu de sélecteurs.
 */
export const fcDemoSpLocators = {
  /** Titre d'onglet de la page de connexion du démonstrateur. */
  loginPageTitle: 'Mock Service Provider',
  loginButton: roleSelector('button', 'Connexion à FranceConnect'),
  /** Écran de consentement de FranceConnect quand une session FC est ouverte (« Continuer sur FSP1 LOW - Sandbox »). */
  consentButton: 'button*=Continuer sur',
  /** Lien de la page « Login Callback » : déconnexion de FranceConnect. */
  logoutLink: roleSelector('link', 'Se déconnecter'),
}
