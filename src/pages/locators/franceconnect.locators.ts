import type { Locator } from './onboarding.locators'

/**
 * Sélecteurs du flux FranceConnect OIDC — formulaire FCP-LOW mock.
 *
 * Ces sélecteurs sont des XPath WebView (CSS/XPath standard, comme dans un navigateur).
 * Ils s'utilisent exclusivement après switchContext('WEBVIEW_*') via withWebView().
 *
 * Le formulaire FCP-LOW est identique sur Android et iOS (même HTML de mock OIDC),
 * donc un seul jeu de sélecteurs sans split plateforme.
 *
 * Note : les noms exacts des attributs HTML (`name`, `id`) du mock FCP-LOW doivent
 * être vérifiés via l'inspecteur DOM (DevTools ou Appium Inspector) lors du premier run.
 * Les sélecteurs ci-dessous utilisent une stratégie à plusieurs branches (|) pour
 * s'adapter à différentes structures de formulaire sans modification.
 */

export interface FranceConnectLocators {
  eidasFaibleLink: Locator  // lien "niveau faible" sur la page de sélection eiDAS
  fcpLowHeading:   Locator  // titre de confirmation que la page FCP-LOW est chargée
  identifierField: Locator  // champ identifiant utilisateur
  passwordField:   Locator  // champ mot de passe
  submitButton:    Locator  // bouton de soumission du formulaire
}

/**
 * Sélecteurs vérifiés par inspection Appium (Maestro inspect_screen) sur le staging réel.
 *
 * Page 1 — sélection eiDAS (FranceConnect) :
 *   Les IDPs ont id="idp-<uuid>" dans le DOM ; le premier de la liste est toujours eIDAS faible.
 *   aria-label="Démonstration eIDAS faible " (avec espace final) confirmé en staging.
 *
 * Page 2 — formulaire FCP-LOW :
 *   Conteneur : id="mire" ; champs : id="login", id="password" ; bouton : type="submit".
 */
export const fcpLocators: FranceConnectLocators = {
  // aria-label="Démonstration eIDAS faible " (espace final) confirmé en staging.
  eidasFaibleLink: '[aria-label*="faible"]',

  // Outer container de la page FCP-LOW (confirme que la navigation eiDAS a abouti)
  fcpLowHeading: '#mire',

  // Champs confirmés par inspection DOM (Maestro rid = HTML id)
  identifierField: '#login',
  passwordField:   '#password',

  // Bouton "Valider" (type=submit confirmé)
  submitButton: 'button[type="submit"]',
}

// Pas de getXxxLocators() — un seul jeu cross-platform
