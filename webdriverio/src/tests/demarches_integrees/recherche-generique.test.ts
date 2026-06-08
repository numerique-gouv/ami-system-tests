import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.6 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie les flux sortants légers vers un tiers pour la recherche de démarche
 * générique (par ex. critère de localité). Données potentiellement à caractère personnel :
 * vérifier la minimisation (cf. DAT 3.5).
 */
describe('Démarches intégrées — recherche de démarche générique', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('minor')
    // TODO pré-requis :
    //   - périmètre des critères de recherche stabilisé (DAT 3.5 — encore à préciser)
    //   - tiers de recherche cible disponible en environnement de test
  })

  it.skip("recherche une démarche générique avec critère de contexte (ex. localité)", async () => {
    // 1. Ouvrir l'écran de recherche de démarche
    // 2. Saisir un critère de localité
    // 3. Vérifier la réception de résultats pertinents
    // 4. Ouvrir un résultat → vérifier le routage vers la démarche correspondante
  })

  it.skip("minimise les données transmises au tiers de recherche", async () => {
    // 1. Capturer la requête sortante (proxy de test, à définir)
    // 2. Vérifier qu'aucune donnée d'identité ne figure dans la requête
    // 3. Vérifier que seuls les critères de contexte attendus sont transmis
  })
})
