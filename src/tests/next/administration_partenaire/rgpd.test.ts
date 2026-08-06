import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 1.5 du backlog `docs/parcours_partenaires.md`.
 *
 * Rôle requis : `Administrateur·ice`.
 * Suppression des données d'un usager dans le cadre des demandes RGPD,
 * vérification de la disparition côté Usager 360 / statistiques et de la trace d'action.
 */
describe('Espace Partenaire — RGPD : suppression de données usager', () => {
  before(async () => {
    await AllureReporter.addFeature('Administration partenaire')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - session ProConnect avec rôle Administrateur·ice
    //   - usager de test avec données (notifications, démarches) à supprimer
  })

  it.skip("supprime les données d'un usager identifié", async () => {
    // 1. Ouvrir la fiche Usager 360 de l'usager cible
    // 2. Déclencher l'action de suppression RGPD
    // 3. Confirmer la suppression
    // 4. Vérifier le message de confirmation
  })

  it.skip("retire l'usager supprimé de l'Usager 360 et des statistiques", async () => {
    // 1. Après suppression, rechercher à nouveau l'usager → absent
    // 2. Vérifier la diminution des compteurs concernés dans les statistiques
    // 3. Vérifier que les notifications associées ont disparu (cf. publications_partenaires/historique-suivi)
  })

  it.skip("trace l'action de suppression dans le journal d'administration", async () => {
    // 1. Consulter le journal des actions d'administration
    // 2. Vérifier la présence d'une entrée avec :
    //    — date
    //    — administrateur·ice à l'origine
    //    — identifiant de l'usager supprimé
    //    — intitulé de l'action
  })
})
