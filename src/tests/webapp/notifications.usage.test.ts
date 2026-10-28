import NotificationsInboxPage from '../../pages/notifications.page'
import DemarcheDetailPage from '../../pages/demarche-detail.page'
import PreferencesPage from '../../pages/preferences.page'
import {getBackendUrl, PARTNER_AMI, grantDemarchesConsent, publishDemarche, publishNotification} from '../../helpers/partner-api'
import {getUser} from '../../helpers/common/test-users'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {step} from '@helpers/reporting/report'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Notifications in-app en webapp : réception dans l'inbox, ouverture d'une notification liée à une
 * démarche, accès à la gestion des notifications. Chaque notification publiée porte un titre
 * horodaté unique (idempotence backend, CONTRIBUTING.md §6). Pré-requis : variables NOTIF_*.
 */
describe('Notifications', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  const user = getUser('avec_nom_dusage')

  before(async function () {
    await getAppToStartingState()
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
  })

  beforeEach(async function () {
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    // Avant de publier : l'inbox ouvre son WebSocket au montage, une notification publiée plus tôt serait perdue.
    await NotificationsInboxPage.assertDisplayed()
  })

  // Règle (utilisateur, 2026-10-26) : notification consentie ou non, elle est reçue dans le CENTRE DE NOTIFICATIONS ; si le push est
  // consenti (permission du navigateur + interrupteur Préférences > Notifications), on reçoit EN PLUS la version notification système.
  it("sans push consenti : la notification est reçue dans l'inbox, sans notification système", async () => {
    const title = `AMI-vanilla-${Date.now()}`
    step("1. Publier la notification via l'API partenaire (push demandé, mais non consenti dans ce navigateur)")
    await publishNotification({
      title, body: "Test vanilla — doit apparaître dans l'inbox", recipientFcHash: user.fcHash, tryPush: true,
    })
    step("2. Vérifier la réception, puis l'ouvrir")
    await NotificationsInboxPage.assertNotificationReceived(title)
    expect(await PreferencesPage.webSystemNotificationTitles()).not.toContain(title)
    await NotificationsInboxPage.clickNotification(title)
  })

  // SKIP : service de push externe non fiable, non testé en webapp (les push sont testés sur mobile : src/tests/mobile/notifications.usage.test.ts).
  // Le corps est conservé pour le jour où le push navigateur sera de nouveau testable ; rien d'autre ne dépend de ce test.
  it.skip("avec push consenti : la notification est reçue dans l'inbox ET en notification système du navigateur", async function () {
    step("1. Autoriser les notifications du navigateur et activer l'interrupteur de Préférences")
    await browser.setPermissions({name: 'notifications'}, 'granted')
    await getAppToStartingState() // beforeEach a ouvert l'inbox, qui n'a pas la barre basse (menu « Plus »)
    await PreferencesPage.open()
    await PreferencesPage.openPushNotificationsSettings()
    await PreferencesPage.setPushNotifications(true)
    try {
      if (!await PreferencesPage.waitForWebPushSubscription()) {
        // Pas de faux test : sans abonnement Web Push, le serveur n'a aucun destinataire de push à joindre.
        log.warn("BLOQUÉ — le navigateur piloté n'obtient pas d'abonnement Web Push (pushManager.subscribe) : version système non testable ici")
        this.skip()
      }

      step("2. Ouvrir l'inbox puis publier la notification avec push")
      await getAppToStartingState() // retour à l'Accueil (on est dans les Préférences)
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
      const title = `AMI-push-${Date.now()}`
      await publishNotification({title, body: 'Test push — inbox ET notification système', recipientFcHash: user.fcHash, tryPush: true})

      step('3. Reçue dans l\'inbox ET affichée par le navigateur (service worker)')
      await NotificationsInboxPage.assertNotificationReceived(title)
      await browser.waitUntil(async () => (await PreferencesPage.webSystemNotificationTitles()).includes(title), {
        timeout: 30000, interval: 1000, timeoutMsg: `Notification « ${title} » reçue dans l'inbox mais jamais affichée comme notification système après 30000ms`,
      })
    } finally {
      await getAppToStartingState()
      await PreferencesPage.open()
      await PreferencesPage.openPushNotificationsSettings()
      await PreferencesPage.setPushNotifications(false)
      await browser.setPermissions({name: 'notifications'}, 'prompt')
    }
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
