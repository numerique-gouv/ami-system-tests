import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../../pages/home.page'
import SuiviDemarchesPage from '@pages/suivi-demarches.page'
import DemarcheDetailPage from '../../pages/demarche-detail.page'
import {getBackendUrl, publishNotification} from '../../helpers/notifications-api'
import {getUser} from '../../helpers/test-users'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Suivi des démarches en webapp : cycle de vie d'une démarche partenaire, détail et historique,
 * démarches archivées.
 *
 * Le cycle new → wip → closed est un cycle de vie d'entité backend (exception documentée à
 * l'indépendance des it(), CONTRIBUTING.md §6) : les 3 premiers tests partagent le même `itemId`
 * horodaté, chacun publie sa propre notification et valide l'état de la liste sans supposer
 * celui laissé par le précédent. Le détail et les archivées sont indépendants.
 * Pré-requis : variables NOTIF_* dans .env.local.
 */
describe('Suivi des démarches', () => {
  const user = getUser('avec_nom_dusage')
  let itemId: string
  let title: string
  let urlV1: string
  let urlV2: string

  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Démarches')
    await AllureReporter.addFeature('Suivi des démarches')
    await AllureReporter.addSeverity('critical')
    await AllureReporter.addTag('api-notifications')
    const domainUrl = getBackendUrl()
    itemId = `E2E-${new Date().toISOString()}`
    title = `Demarche E2E ${itemId}` // sans accent : la recherche par innerText les gère mal
    urlV1 = `${domainUrl}/demarches/${itemId}/v1`
    urlV2 = `${domainUrl}/demarches/${itemId}/v2`
    await getAppToStartingState()
  })

  after(async () => {
    try { await SuiviDemarchesPage.goToHome() } catch { /* session déjà terminée */ }
  })

  it('crée une démarche visible dans le suivi (statut new)', async () => {
    const titleNew = `${title} 0`
    await AllureReporter.addStep('1. Ouvrir le suivi puis publier la notification avec tous les champs')
    await HomePage.ouvreSuivi()
    await publishNotification({
      title: titleNew, body: 'Corps de la notification E2E', recipientFcHash: user.fcHash,
      privateBody: 'Contenu privé E2E', icon: 'fr-icon-notification-3-line', contentLink: urlV1,
      itemType: 'OTV', itemId, itemStatusLabel: 'Brouillon', itemGenericStatus: 'new', itemCanal: 'AMI',
    })

    await AllureReporter.addStep('2. Attendre la démarche, vérifier son statut puis son lien externe V1')
    await SuiviDemarchesPage.waitForDemarche(titleNew)
    await SuiviDemarchesPage.assertVisibleDemarcheWith(titleNew, 'Brouillon')
    await SuiviDemarchesPage.ouvreDemarche(titleNew)
    await DemarcheDetailPage.assertLienExterne(urlV1)
    await SuiviDemarchesPage.retourJusquAPageSuivi()
  })

  it("met à jour l'URL externe de la démarche (statut wip)", async () => {
    const titleUpdate = `${title} 1`
    await AllureReporter.addStep('1. Publier la notification avec la nouvelle URL')
    await publishNotification({
      title: titleUpdate, body: 'Mise à jour E2E', recipientFcHash: user.fcHash, contentLink: urlV2,
      itemType: 'OTV', itemId, itemStatusLabel: 'En cours', itemGenericStatus: 'wip', itemCanal: 'AMI',
    })

    await AllureReporter.addStep('2. Attendre la démarche, vérifier son statut puis son lien externe V2')
    await SuiviDemarchesPage.waitForDemarche(titleUpdate)
    await SuiviDemarchesPage.assertVisibleDemarcheWith(titleUpdate, 'En cours')
    await SuiviDemarchesPage.ouvreDemarche(titleUpdate)
    await DemarcheDetailPage.assertLienExterne(urlV2)
    await SuiviDemarchesPage.retourJusquAPageSuivi()
  })

  it('clôture la démarche (statut closed) et affiche son historique dans le détail', async () => {
    const titleClosing = `${title} 2`
    await AllureReporter.addStep('1. Publier la notification de clôture')
    await publishNotification({
      title: titleClosing, body: 'Clôture E2E', recipientFcHash: user.fcHash, contentLink: urlV2,
      itemType: 'OTV', itemId, itemStatusLabel: 'Terminé', itemGenericStatus: 'closed', itemCanal: 'AMI',
    })

    await AllureReporter.addStep('2. Attendre la démarche et vérifier son statut')
    await SuiviDemarchesPage.waitForDemarche(titleClosing)
    await SuiviDemarchesPage.assertVisibleDemarcheWith(titleClosing, 'Terminé')

    await AllureReporter.addStep("3. Ouvrir le détail : statut, référence et historique des 3 mises à jour")
    await SuiviDemarchesPage.ouvreDemarche(titleClosing)
    await DemarcheDetailPage.assertDetail({
      title: titleClosing, statusLabel: 'Terminé', reference: itemId,
      messages: ['Corps de la notification E2E', 'Mise à jour E2E', 'Clôture E2E'],
    })
    await SuiviDemarchesPage.retourJusquAPageSuivi()
  })

  it('affiche la page des démarches archivées et les partenaires suivis', async () => {
    await SuiviDemarchesPage.openArchived()
    expect(await SuiviDemarchesPage.archivedPartners()).toEqual(
      expect.arrayContaining(['AMI', 'Démarche Numérique', 'RDV Service Public', 'Service Public'])
    )
  })
})
