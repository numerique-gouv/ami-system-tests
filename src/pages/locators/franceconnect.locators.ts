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
  eidasFaibleLabel: string   // nom accessible du lien eIDAS faible (pour tl().getByRole dans le PO)
  fcpLowHeading:    Locator  // titre de confirmation que la page FCP-LOW est chargée
  identifierField:  Locator  // champ identifiant utilisateur
  passwordField:    Locator  // champ mot de passe
  submitButton:     Locator  // bouton de soumission du formulaire
}

/**
 * Sélecteurs vérifiés par inspection (just inspect) sur le staging réel.
 *
 * Page 1 — sélection eiDAS (FranceConnect) :
 *   L'IDP eIDAS faible expose role="link" + nom accessible "Démonstration eIDAS faible"
 *   (confirmé via just inspect, ligne 9). Pas d'aria-label HTML — ciblage par rôle+nom via TL.
 *   Le PO utilise : tl().getByRole('link', { name: new RegExp(fcpLocators.eidasFaibleLabel, 'i') })
 *
 * Page 2 — formulaire FCP-LOW :
 *   Conteneur : id="mire" ; champs : id="login", id="password" ; bouton : type="submit".
 */
export const fcpLocators: FranceConnectLocators = {
  // Nom accessible confirmé via just inspect (2026-06-26)
  eidasFaibleLabel: 'Démonstration eIDAS faible',

  // Outer container de la page FCP-LOW (confirme que la navigation eiDAS a abouti)
  fcpLowHeading: '#mire',

  // Champs confirmés par inspection DOM (Maestro rid = HTML id)
  identifierField: '#login',
  passwordField:   '#password',

  // Bouton "Valider" (type=submit confirmé)
  submitButton: 'button[type="submit"]',
}

// Pas de getXxxLocators() — un seul jeu cross-platform
