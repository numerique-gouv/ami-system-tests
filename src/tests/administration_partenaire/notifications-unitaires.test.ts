import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 1.3 du backlog `docs/parcours_partenaires.md`.
 *
 * Rôle requis : `Notification`.
 * Envoi d'une notification individuelle depuis l'Espace Partenaire et vérification
 * côté app AMI. Test hybride : driver web pour l'envoi, driver mobile pour la réception.
 * La coordination des deux drivers reste à définir.
 */
describe("Espace Partenaire — notifications unitaires", () => {
  before(async () => {
    await AllureReporter.addFeature('Administration partenaire')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - session ProConnect avec rôle Notification
    //   - usager connu de l'app AMI (identité FranceConnect sandbox déjà liée)
    //   - app AMI ouverte ou enrôlée FCM côté mobile
  })

  it.skip("envoie une notification unitaire reçue côté app AMI", async () => {
    // 1. Ouvrir la page d'envoi de notification unitaire dans l'Espace Partenaire
    // 2. Sélectionner ou saisir l'identifiant de l'usager cible
    // 3. Renseigner titre + corps + déclencher l'envoi
    // 4. Côté app AMI, ouvrir l'inbox in-app
    // 5. Vérifier la présence de la notification (titre, corps)
  })

  it.skip("affiche une erreur explicite en cas d'échec (Numéro d'identification inconnu, payload invalide)", async () => {
    // 1. Soumettre un envoi avec un Numéro d'identification inexistant
    //    — vérifier le message d'erreur
    // 2. Soumettre un envoi avec un payload invalide (titre vide, corps trop long…)
    //    — vérifier la validation côté formulaire
  })

  it.skip("masque l'action d'envoi pour un rôle Support", async () => {
    // 1. Se connecter avec un compte ayant uniquement le rôle Support
    // 2. Vérifier que la page / le bouton d'envoi de notification n'est pas accessible
    // 3. Tenter l'accès direct à l'URL d'envoi → refus (403 ou redirection)
  })
})
