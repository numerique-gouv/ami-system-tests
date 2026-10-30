/** Écrans du parcours de connexion reconnus dans la WebView par une seule requête (`probeFranceConnectWebScreen`). */
export const authenticateProbeLocators = {
  /** Routes d'accueil de première connexion : l'étape « accueil » les passe. */
  welcomeRoute: '#/welcome/(zones|notifications)',
  /** Salutation de l'accueil : <h1> (ou <p> sur d'anciennes versions) qui commence par « Bonjour ». */
  greetingElements: 'h1, p',
  greetingPrefix: 'Bonjour',
  /** `<button>` seulement : la mire eIDAS contient « FranceConnect » dans un lien de pied de page. */
  loginButtons: 'button',
  loginButtonText: 'franceconnect',
  eidasElements: 'button, a',
  eidasText: 'eidas faible',
  /** Bandeau du fournisseur d'identité de démonstration ; `.` tolère l'apostrophe droite et la typographique. */
  credentialsBanner: "Fournisseur d.identité de démonstration - FCP-LOW",
}
