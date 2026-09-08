import AllureReporter from '@wdio/allure-reporter'

/**
 * Écart de couverture identifié lors de la reconstruction du modèle applicatif du 2026-09-08
 * (cf. references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md
 * § Préférences). Sous-écran Plus > Préférences > Notifications, non ouvert en détail lors de
 * l'exploration (non confirmé dans le modèle de site).
 */
describe('Préférences — réglages des notifications', () => {
  before(async () => {
    await AllureReporter.addFeature('Préférences')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - usager FranceConnect connecté (getAppToStartingState())
    //   - contenu exact de l'écran à inspecter via `just inspect` avant d'écrire les assertions (non observé en détail)
  })

  it.skip("accède au sous-écran Notifications depuis Plus > Préférences", async () => {
    // 1. Naviguer vers Plus > Préférences
    // 2. Ouvrir l'entrée "Notifications"
    // 3. Vérifier l'arrivée sur le bon écran (route/heading à déterminer via just inspect)
  })

  // À CONFIRMER avant implémentation : la destination du bouton "Gérer" en haut à droite de
  // l'inbox notifications (/#/notifications) n'a pas été vérifiée lors de l'exploration —
  // probablement ce même sous-écran Préférences > Notifications, mais non cliqué pour éviter
  // de modifier un réglage sur le compte de test partagé sans savoir où ça mène.
  it.skip("À CONFIRMER : le bouton Gérer de l'inbox notifications mène au même écran que Préférences > Notifications", async () => {
    // 1. Ouvrir l'inbox notifications (/#/notifications)
    // 2. Cliquer sur "Gérer"
    // 3. Vérifier que la destination correspond au sous-écran Préférences > Notifications
  })
})
