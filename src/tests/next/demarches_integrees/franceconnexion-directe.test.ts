import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.3 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie le comportement côté partenaire selon qu'il implémente ou non
 * la FranceConnexion directe (idp_hint=AMI-FI + prompt=login), et le cas
 * d'une session FranceConnect expirée malgré la reconnexion silencieuse.
 */
describe('Démarches intégrées — FranceConnexion directe chez le partenaire', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - démarche partenaire « avec FC directe » identifiée
    //   - démarche partenaire « sans FC directe » identifiée
    //   - usager FranceConnect sandbox avec FranceConnexion longue active
  })

  it.skip("évite la page d'information FranceConnect quand le partenaire implémente la FC directe", async () => {
    // 1. Lancer une démarche partenaire implémentant la FC directe
    // 2. Vérifier l'absence de la page d'information FranceConnect côté partenaire
    // 3. Vérifier que l'usager arrive directement sur la démarche authentifiée
  })

  it.skip("fonctionne avec un partenaire qui n'implémente pas la FC directe", async () => {
    // 1. Lancer une démarche partenaire sans FC directe
    // 2. Compléter le parcours FranceConnect standard côté partenaire
    // 3. Vérifier que l'usager finit bien sur la démarche authentifiée
  })

  it.skip("gère le cas d'une session FranceConnect expirée malgré la reconnexion silencieuse", async () => {
    // 1. Forcer l'expiration de la session FC côté partenaire (env de test ou attente)
    // 2. Lancer la démarche → reconnexion silencieuse AMI-FI OK
    // 3. Vérifier la cinématique côté partenaire (réauth FC ou message)
    // 4. Vérifier qu'aucun état incohérent ne reste dans AMI
  })
})
