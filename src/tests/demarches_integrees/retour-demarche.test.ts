import AllureReporter from '@wdio/allure-reporter'

/**
 * Section 2.5 du backlog `docs/parcours_partenaires.md`.
 *
 * Vérifie le retour d'information de fin de démarche vers AMI :
 * postMessage entre frontaux (état actuel), signature du message (cible),
 * mise à jour du suivi, abandon, et rejet d'un message non conforme.
 */
describe('Démarches intégrées — retour de démarche vers AMI', () => {
  before(async () => {
    await AllureReporter.addFeature('Démarches intégrées')
    await AllureReporter.addSeverity('critical')
    // TODO pré-requis :
    //   - démarche partenaire qui émet un retour de fin
    //   - un mécanisme de simulation côté partenaire (sandbox ou stub) pour les cas d'abandon / message non conforme
  })

  it.skip("reçoit un message de retour via postMessage en fin de démarche", async () => {
    // 1. Lancer une démarche
    // 2. La compléter jusqu'au retour
    // 3. Vérifier que AMI Front reçoit le postMessage attendu
    // 4. Vérifier que l'utilisateur retombe sur l'écran de suivi
  })

  it.skip("vérifie la signature du message de retour (cible)", async () => {
    // 1. Compléter une démarche émettant un message signé
    // 2. Vérifier qu'AMI valide la signature avant de prendre en compte le retour
    // 3. Vérifier qu'un message à signature invalide n'altère pas l'historique
  })

  it.skip("met à jour l'historique / suivi de démarches après le retour", async () => {
    // 1. Noter l'état initial du suivi pour l'usager
    // 2. Compléter une démarche
    // 3. Vérifier la nouvelle entrée correspondante dans le suivi (libellé, date, statut)
  })

  it.skip("gère l'abandon : l'usager ferme la webview avant la fin", async () => {
    // 1. Lancer une démarche
    // 2. Fermer la webview avant d'avoir reçu le retour
    // 3. Vérifier qu'aucune entrée de complétion n'est créée
    // 4. Vérifier que la reprise reste possible (relance OK)
  })

  it.skip("rejette un message de retour mal formé ou non signé", async () => {
    // 1. Provoquer un retour mal formé (ou non signé une fois la signature en place)
    // 2. Vérifier qu'AMI ne crée pas d'entrée
    // 3. Vérifier qu'un message d'erreur ou un état neutre est affiché à l'usager
  })
})
