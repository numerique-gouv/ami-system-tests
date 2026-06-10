import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.2 du backlog `docs/parcours_partenaires.md`.
 *
 * Cinématique de lancement d'une démarche partenaire depuis l'app AMI :
 * reconnexion silencieuse via AMI-FI, ouverture en webview intégrée (URL whitelistée)
 * ou redirection vers le navigateur externe (URL non whitelistée).
 * Driver : Appium mobile, contexte mixte natif + WebView.
 */
describe('Démarches intégrées — lancement en webview', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - usager FranceConnect sandbox déjà connecté (FranceConnexion longue active)
    //   - liste blanche d'URL configurée avec au moins une URL OK et une URL hors liste
  })

  it.skip("déclenche une reconnexion silencieuse AMI-FI avant la redirection partenaire", async () => {
    // 1. Tap sur une démarche partenaire dans le catalogue
    // 2. Observer le déclenchement du parcours AMI-FI (auth locale biométrie/code)
    // 3. Vérifier qu'aucune redirection vers le partenaire n'a eu lieu avant la fin de la reconnexion
  })

  it.skip("ouvre la démarche en webview intégrée après reconnexion silencieuse réussie", async () => {
    // 1. Tap sur une démarche partenaire (URL whitelistée)
    // 2. Compléter la reconnexion silencieuse
    // 3. Vérifier l'ouverture de la webview intégrée sur la page partenaire
    // 4. Vérifier que la barre native AMI reste visible (contexte webview embarqué)
  })

  it.skip("applique la cinématique d'échec de reconnexion silencieuse (à préciser dans DAT 5.1)", async () => {
    // 1. Forcer un échec d'auth locale (annulation biométrie, mauvais code)
    // 2. Vérifier la cinématique retenue une fois définie :
    //    — message à l'usager
    //    — éventuelle reprise via FranceConnect classique
    //    — pas de redirection silencieuse vers le partenaire
  })

  it.skip("ouvre une URL whitelistée dans la webview intégrée", async () => {
    // 1. Préparer une démarche dont l'URL est dans la liste blanche
    // 2. La lancer
    // 3. Vérifier l'ouverture en webview intégrée (pas de bascule navigateur externe)
  })

  it.skip("ouvre une URL hors liste blanche dans le navigateur externe", async () => {
    // 1. Préparer une démarche dont l'URL n'est PAS dans la liste blanche
    // 2. La lancer
    // 3. Vérifier que l'app AMI passe la main au navigateur externe du terminal
    // 4. Vérifier qu'aucune webview intégrée n'est ouverte
  })

  it.skip("permet de revenir avec le bouton retour natif depuis la webview partenaire", async () => {
    // 1. Lancer une démarche en webview intégrée
    // 2. Utiliser le bouton retour natif
    // 3. Vérifier le retour sur la page précédente AMI (pas de blocage, pas de fermeture inopinée)
  })
})
