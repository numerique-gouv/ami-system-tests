import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 3.3 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie l'alimentation de l'historique des événements de l'usager par les
 * notifications partenaires, l'ordonnancement de plusieurs notifications sur
 * une même démarche, et la suppression RGPD côté Espace Partenaire.
 */
describe('Publications partenaires — historique et suivi de démarches', () => {
  before(async () => {
    await AllureReporter.addFeature('Publications partenaires')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - usager FranceConnect sandbox connecté
    //   - helper publishNotification utilisable pour produire plusieurs notifications
  })

  it.skip("alimente l'historique des événements avec une notification partenaire", async () => {
    // 1. Publier une notification partenaire pour l'usager
    // 2. Ouvrir l'historique / inbox dans l'app AMI
    // 3. Vérifier la présence de l'événement (titre, corps, date)
  })

  it.skip("ordonne correctement plusieurs notifications successives sur la même démarche", async () => {
    // 1. Publier 3 notifications avec horodatages connus, sur la même démarche
    // 2. Vérifier l'ordre d'affichage attendu (chronologique décroissant ou conforme à la spec)
    // 3. Vérifier que les libellés / métadonnées sont conservés intacts
  })

  it.skip("supprime les notifications associées après une suppression RGPD dans l'Espace Partenaire", async () => {
    // 1. Publier au moins une notification pour un usager
    // 2. Déclencher la suppression RGPD côté Espace Partenaire (cf. administration_partenaire/rgpd)
    // 3. Vérifier la disparition des notifications dans l'inbox in-app
    // 4. Vérifier l'absence de trace côté API privée associée
  })
})
