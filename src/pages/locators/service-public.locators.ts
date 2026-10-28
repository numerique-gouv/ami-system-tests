/**
 * Pages EXTERNES de Service Public (démarches en ligne) atteintes depuis une carte AMI. Hors SPA AMI : DOM de Service Public,
 * ciblage par texte visible, observé en live le 2026-10-28 en préprod (`preprod.demarches.service-public.gouv.fr`).
 */

export const servicePublicLocators = {
  /** Carte du catalogue AMI « Démarches et outils » qui ouvre le formulaire OTV (data-testid `service-catalog-psl:OperationTranquilliteVacances`). */
  otvCardLabel: 'Opération Tranquillité Vacances',
  /** Titre du formulaire OTV, atteint sans mire FranceConnect quand AMI a transmis son jeton. */
  otvHeading: 'h1*=Opération Tranquillité Vacances',
  /** Bandeau du formulaire : l'identité vient de FranceConnect sans que l'usager se soit identifié (connexion silencieuse). Texte partiel : l'apostrophe varie. */
  identityProvidedByFranceConnect: '*=fournies par FranceConnect',
  /** Page de connexion de Service Public (realm `service-public`) : lien de connexion FranceConnect. Son texte est sur deux lignes
   *  (« S’identifier avec » / « FranceConnect ») : on ne cible que la première, un texte sur une ligne ne correspondrait pas. */
  loginWithFranceConnectLink: 'a*=identifier avec',
  /** Formulaire OTV ouvert DIRECTEMENT, sans le jeton `caller` d'AMI (préprod). Aucun jeton dans cette adresse. */
  otvDirectUrl: 'https://preprod.demarches.service-public.gouv.fr/mademarche/demarcheGenerique/?codeDemarche=OperationTranquilliteVacances',
}
