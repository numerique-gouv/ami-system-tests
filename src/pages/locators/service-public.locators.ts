export const servicePublicLocators = {
  /** Carte du catalogue AMI qui ouvre le formulaire OTV. */
  otvCardLabel: 'Opération Tranquillité Vacances',
  otvHeading: 'h1*=Opération Tranquillité Vacances',
  /** Texte partiel : l'apostrophe varie. */
  identityProvidedByFranceConnect: '*=fournies par FranceConnect',
  /** Le texte du lien est sur deux lignes : on ne cible que la première. */
  loginWithFranceConnectLink: 'a*=identifier avec',
  /** Formulaire OTV ouvert sans le jeton `caller` d'AMI (préprod). */
  otvDirectUrl: 'https://preprod.demarches.service-public.gouv.fr/mademarche/demarcheGenerique/?codeDemarche=OperationTranquilliteVacances',
}
