import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.4 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie les modalités de préremplissage d'une démarche partenaire :
 * JWT signé par AMI + chiffré avec la clé publique partenaire (cible),
 * ou URL HTTPS simplifiée (type DN).
 */
describe('Démarches intégrées — préremplissage', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - partenaire « préremplissage JWT » configuré (clé publique installée côté AMI, clé privée côté partenaire)
    //   - partenaire « préremplissage URL HTTPS » configuré
    //   - usager avec données API Particulier permettant un préremplissage déterministe
  })

  it.skip("prérempli la démarche via JWT signé par AMI et chiffré pour le partenaire", async () => {
    // 1. Lancer la démarche cible JWT
    // 2. Vérifier la présence du JWT dans la requête sortante (à inspecter côté env de test)
    // 3. Vérifier côté partenaire que les champs attendus sont préremplis
  })

  it.skip("prérempli la démarche via URL HTTPS (modalité simplifiée type DN)", async () => {
    // 1. Lancer la démarche cible URL
    // 2. Vérifier que les paramètres de préremplissage figurent dans l'URL
    // 3. Vérifier côté partenaire que les champs attendus sont préremplis
  })

  it.skip("transmet uniquement les données attendues (pas de fuite supplémentaire)", async () => {
    // 1. Capturer le payload de préremplissage (JWT décodé ou URL parsée)
    // 2. Comparer aux données prévues par la convention partenaire
    // 3. Vérifier qu'aucune donnée hors périmètre n'est transmise
  })

  it.skip("ouvre la démarche vierge quand aucun préremplissage n'est prévu", async () => {
    // 1. Lancer une démarche sans préremplissage configuré
    // 2. Vérifier l'absence de paramètres ou de JWT dans la requête
    // 3. Vérifier que les champs partenaire sont vides
  })
})
