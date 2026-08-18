import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 1.4 du backlog `docs/parcours_partenaires.md`.
 *
 * Rôle requis : `Support`.
 * Vérifie l'accès en lecture (HomePage connectée, statistiques, Usager 360)
 * et la restriction sur les actions des rôles supérieurs.
 */
describe('Espace Partenaire — consultation et statistiques', () => {
  before(async () => {
    await AllureReporter.addFeature('Administration partenaire')
    await AllureReporter.addSeverity('normal')
    // TODO pré-requis :
    //   - session ProConnect avec uniquement le rôle Support
  })

  it.skip("accède à la page d'accueil connectée", async () => {
    // 1. Ouvrir la HomePage connectée
    // 2. Vérifier les éléments propres au rôle Support
  })

  it.skip("accède aux pages de statistiques", async () => {
    // 1. Naviguer vers la section statistiques
    // 2. Vérifier l'affichage des indicateurs attendus (volume usagers, notifications…)
  })

  it.skip("accède à la page « Usager 360 »", async () => {
    // 1. Rechercher un usager
    // 2. Ouvrir sa fiche Usager 360
    // 3. Vérifier l'affichage des sections attendues (identité, démarches, notifications)
  })

  it.skip("n'affiche pas les actions réservées aux rôles supérieurs", async () => {
    // 1. Depuis la HomePage connectée et la fiche Usager 360, vérifier l'absence de :
    //    — administration des rôles
    //    — suppression des données usager
    //    — envoi de notification unitaire
    // 2. Tenter un accès direct à chacune de ces URL → refus
  })
})
