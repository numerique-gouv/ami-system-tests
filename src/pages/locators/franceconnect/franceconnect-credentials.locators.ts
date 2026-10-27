/**
 * Sélecteurs du formulaire FCP-LOW mock (identifiant/mot de passe FranceConnect sandbox).
 *
 * WebView, structure identique Android/iOS (mock OIDC hors app AMI). Relevé du 2026-10-13 : `<label for="login">Identifiant`,
 * `<input type="text" name="login">`, `<label for="password">Mot de passe`, `<input type="password" name="password">`,
 * bouton « Valider ». Champs par leur attribut `name` : `aria/<libellé>`, qui marche en webapp, a renvoyé sur Android et iOS
 * un élément non éditable (« invalid element state » au `clearValue()`). Bouton par son texte (« contient », insensible à la
 * casse : `button.*=`).
 */
export const fcCredentialsLocators = {
  identifierField: 'input[name="login"]',
  passwordField: 'input[name="password"]',
  submitButton: 'button.*=valider',
}

// Pas de getXxxLocators() — un seul jeu cross-platform

/** iOS seulement : les champs du formulaire (Identifiant, Mot de passe…) lus dans l'arbre natif — même usage que `iosEidasLinkNativeAx`. */
export const iosCredentialsFieldsNativeAx =
  '-ios predicate string:type == "XCUIElementTypeTextField" OR type == "XCUIElementTypeSecureTextField"'
