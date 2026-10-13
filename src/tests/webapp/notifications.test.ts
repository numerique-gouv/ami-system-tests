import NotificationsInboxPage from '../../pages/notifications.page'
import DemarcheDetailPage from '../../pages/demarche-detail.page'
import PreferencesPage from '../../pages/preferences.page'
import {getBackendUrl, grantConsent, publishDemarche, publishNotification} from '../../helpers/partner-api'
import {getUser} from '../../helpers/test-users'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {step} from '@helpers/report'

/**
 * Notifications in-app en webapp : réception dans l'inbox, ouverture d'une notification liée à une
 * démarche, accès à la gestion des notifications. Chaque notification publiée porte un titre
 * horodaté unique (idempotence backend, CONTRIBUTING.md §6). Pré-requis : variables NOTIF_*.
 */
describe('Notifications', () => {
  const user = getUser('avec_nom_dusage')

  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
    await grantConsent(user.fcHash)
  })

  beforeEach(async function () {
    this.timeout(180000)
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    // Avant de publier : l'inbox ouvre son WebSocket au montage, une notification publiée plus tôt serait perdue.
    await NotificationsInboxPage.assertDisplayed()
  })

  it("reçoit une notification publiée dans l'inbox in-app", async () => {
    const title = `AMI-vanilla-${Date.now()}`
    step("1. Publier la notification via l'API partenaire")
    await publishNotification({
      title, body: "Test vanilla — doit apparaître dans l'inbox", recipientFcHash: user.fcHash,
    })
    step("2. Vérifier la réception, puis l'ouvrir")
    await NotificationsInboxPage.assertNotificationReceived(title)
    await NotificationsInboxPage.clickNotification(title)
  })

  it('ouvre le détail de la démarche depuis une notification liée à une démarche', async () => {
    const itemId = `E2E-${new Date().toISOString()}`
    const title = `Demarche E2E ${itemId} notif`
    await publishDemarche({
      title, body: 'Notification de démarche E2E', recipientFcHash: user.fcHash,
      contentLink: `${getBackendUrl()}/demarches/${itemId}/v1`,
      itemType: 'OTV', itemId, status: 'wip',
    })
    await NotificationsInboxPage.assertNotificationReceived(title)
    await NotificationsInboxPage.clickNotification(title)
    await DemarcheDetailPage.assertDisplayed(title)
  })

  it('« Gérer » ouvre les préférences de notifications', async () => {
    await NotificationsInboxPage.openManage()
    await PreferencesPage.assertNotificationsDisplayed()
  })
})
