import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 1.1 du backlog `docs/parcours_partenaires.md`.
 *
 * Cible : l'Espace Partenaire, une webapp Django (cf. DAT 3.2).
 * Ces tests s'exécutent sur un navigateur web, pas en Appium mobile —
 * la stratégie d'orchestration (capability `browserName` vs profil dédié)
 * reste à définir avant implémentation.
 */
describe('Espace Partenaire — accès et authentification', () => {
  before(async () => {
    await AllureReporter.addFeature('Administration partenaire')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis communs à la suite :
    //   - URL Espace Partenaire (recette) configurée
    //   - comptes ProConnect de test : sans rôle, avec rôle Support, avec rôle Administrateur·ice
  })

  it.skip("se connecte via ProConnect (redirection, retour, session ouverte)", async () => {
    // 1. Ouvrir l'URL racine de l'Espace Partenaire
    // 2. Suivre la redirection vers ProConnect
    // 3. Compléter l'authentification ProConnect (sandbox)
    // 4. Vérifier le retour sur la HomePage connectée
    //    — identité affichée, session active
  })

  it.skip("affiche « Demandez l'accès à un administrateur » pour un agent sans rôle", async () => {
    // 1. Se connecter via ProConnect avec un compte sans habilitation
    // 2. Vérifier le message d'attente d'attribution de rôle
    // 3. Vérifier qu'aucune fonctionnalité d'administration n'est accessible (liens / menus absents)
  })

  it.skip("donne accès à la HomePage connectée pour un agent avec rôle", async () => {
    // 1. Se connecter via ProConnect avec un compte ayant un rôle (ex : Support)
    // 2. Vérifier l'arrivée sur la HomePage connectée
    // 3. Vérifier la présence des éléments propres au rôle
  })

  it.skip("invalide la session à la déconnexion", async () => {
    // 1. Se connecter via ProConnect
    // 2. Déclencher la déconnexion depuis l'Espace Partenaire
    // 3. Vérifier le retour sur la page de connexion
    // 4. Tenter de réutiliser un cookie/URL post-login → redirection vers la page de connexion
  })

  it.skip("redirige vers la page de connexion lors d'un accès direct sans session", async () => {
    // 1. Sans session, ouvrir directement une URL protégée (ex : /administration)
    // 2. Vérifier la redirection vers la page de connexion ProConnect
  })
})
