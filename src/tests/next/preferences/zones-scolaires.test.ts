import AllureReporter from '@wdio/allure-reporter'

/**
 * Reprend l'item "Paramétrer les zones scolaires et constater l'ajout et suppression
 * d'éléments dans le calendrier" de README.md § Scénarios restant à faire — item qui recoupe
 * exactement le sous-écran Plus > Préférences > Zones scolaires identifié comme non couvert
 * lors de la reconstruction du modèle applicatif du 2026-09-08 (cf.
 * references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md
 * § Préférences). Le README reste la source de vérité du backlog ; ce fichier ne fait que le
 * scaffolder.
 */
describe('Préférences — zones scolaires et impact sur l\'agenda', () => {
  before(async () => {
    await AllureReporter.addFeature('Préférences')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - usager FranceConnect connecté (getAppToStartingState())
    //   - capturer l'état initial des zones scolaires sélectionnées (restauration obligatoire en after(),
    //     cf. CONTRIBUTING §6 isolation — écran mutant l'état d'un compte de test partagé)
    //   - une date de test proche d'une période de vacances scolaires pour que le calendrier reflète visiblement le changement
  })

  it.skip("retire toutes les zones scolaires et constate un agenda vide de vacances", async () => {
    // 1. Naviguer vers Plus > Préférences > Zones scolaires
    // 2. Décocher toutes les zones
    // 3. Aller sur Agenda
    // 4. Vérifier l'absence de toute entrée "Vacances de ..."
  })

  it.skip("ajoute une zone scolaire et constate son apparition dans l'agenda", async () => {
    // 1. Depuis l'état "toutes zones retirées", cocher une seule zone
    // 2. Aller sur Agenda
    // 3. Vérifier la présence des entrées de vacances propres à cette zone
  })

  it.skip("restaure l'état initial des zones scolaires", async () => {
    // 1. Recocher les zones d'origine capturées dans before()
    // 2. Vérifier sur Agenda que l'affichage correspond à l'état initial
  })
})
