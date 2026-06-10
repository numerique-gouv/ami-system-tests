import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.1 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie l'affichage des contenus et catalogues partenaires (Service Public, DN)
 * récupérés après FranceConnexion, ainsi que la personnalisation via API Particulier.
 * Driver : Appium mobile, contexte mixte natif + WebView (cf. guidelines/webview-context-switching.md).
 */
describe('Démarches intégrées — catalogue et contenus partenaires', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - usager FranceConnect sandbox connecté
    //   - mire d'onboarding passée
    //   - état initial reproductible (terminateApp / activateApp si nécessaire)
  })

  it.skip("affiche les contenus de catalogue Service Public et DN après FranceConnexion", async () => {
    // 1. Se connecter via FranceConnect
    // 2. Atteindre la home AMI
    // 3. Vérifier la présence d'au moins un contenu issu de Service Public
    // 4. Vérifier la présence d'au moins un contenu issu de DN
  })

  it.skip("dégrade proprement quand un fournisseur de catalogue est indisponible (Service Public, DN)", async () => {
    // 1. Simuler l'indisponibilité côté back-end (stub ou environnement dédié, à définir)
    // 2. Vérifier l'affichage d'un message neutre côté usager
    // 3. Vérifier que le reste du catalogue reste consultable
  })

  it.skip("personnalise un contenu partenaire à partir des données API Particulier", async () => {
    // 1. Se connecter avec un usager dont les données API Particulier déclenchent une personnalisation connue
    // 2. Vérifier l'affichage du contenu personnalisé attendu
    // 3. Vérifier qu'un usager sans ces données ne voit pas la même personnalisation
  })
})
