/**
 * Sélecteurs du formulaire FCP-LOW mock (identifiant/mot de passe FranceConnect sandbox).
 *
 * WebView, structure identique Android/iOS (mock OIDC hors app AMI).
 *
 * Note : les champs identifiant/mot de passe et le bouton de soumission sont ciblés via
 * tl() (getByLabelText / getByRole) directement dans le Page Object, pas ici.
 */

export interface FranceConnectCredentialsLocators {
  fcpLowHeadingText: string  // texte de confirmation que la page FCP-LOW est chargée
}

export const fcCredentialsLocators: FranceConnectCredentialsLocators = {
  // Texte de titre de la page FCP-LOW (confirme que la navigation eiDAS a abouti)
  fcpLowHeadingText: "Fournisseur d'identité de démonstration - FCP-LOW",
}

// Pas de getXxxLocators() — un seul jeu cross-platform
