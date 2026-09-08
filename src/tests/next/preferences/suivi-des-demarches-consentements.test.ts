import AllureReporter from '@wdio/allure-reporter'

/**
 * Écart de couverture identifié lors de la reconstruction du modèle applicatif du 2026-09-08
 * (cf. references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md
 * § Préférences). Écran natif/WebView non couvert par la suite mobile actuelle : Plus >
 * Préférences > Suivi des démarches (route `/#/preferences/consents`), 4 interrupteurs
 * "Suivre mes démarches {Service Public | Démarches Numériques | AMI | Rendez-vous SP} sur
 * mon appareil".
 */
describe('Préférences — consentements de suivi par partenaire', () => {
  before(async () => {
    await AllureReporter.addFeature('Préférences')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - usager FranceConnect connecté (getAppToStartingState())
    //   - état initial des 4 toggles capturé dynamiquement (ne pas coder en dur un état constaté un jour donné)
  })

  it.skip("affiche les 4 interrupteurs partenaire avec leur état actuel", async () => {
    // 1. Naviguer vers Plus > Préférences > Suivi des démarches
    // 2. Vérifier la présence des 4 libellés : Service Public, Démarches Numériques, AMI, Rendez-vous SP
    // 3. Capturer l'état ON/OFF de chacun (état de référence pour les tests suivants)
  })

  it.skip("bascule un interrupteur et vérifie la persistance après reload", async () => {
    // 1. Noter l'état initial d'un interrupteur (ex. AMI)
    // 2. Basculer l'interrupteur
    // 3. Recharger l'app / revenir sur l'écran
    // 4. Vérifier que le nouvel état est conservé
    // 5. Restaurer l'état initial (isolation — compte de test partagé, cf. CONTRIBUTING §6)
  })

  // À CONFIRMER avant implémentation : la relation entre ces toggles et le consentement API
  // (checkConsent/grantConsent de src/helpers/notifications-api.ts) n'est PAS établie dans le
  // modèle de site — ce sont possiblement deux mécanismes distincts (préférence d'affichage
  // local vs consentement légal côté API). Vérifier via `just inspect` + lecture du store SPA
  // avant d'écrire un scénario qui présumerait un lien entre les deux.
  it.skip("À CONFIRMER : relation entre le toggle partenaire et le consentement API (checkConsent/grantConsent)", async () => {
    // 1. Retirer le consentement API d'un partenaire (grantConsent(fcHash, false))
    // 2. Vérifier l'état du toggle correspondant dans Préférences (impacté ou indépendant ?)
    // 3. Documenter la relation réelle observée avant de figer ce test
  })
})
