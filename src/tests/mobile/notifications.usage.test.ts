import NotificationsInboxPage from '../../pages/notifications.page'
import {publishNotification} from '../../helpers/partner-api'
import {getTestUser} from '../../helpers/common/test-users'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {step} from '@helpers/reporting/report'
import {platform} from '../../platform'
import NavigationPage from '../../pages/navigation.page'
import HomePage from '../../pages/home.page'
import PreferencesPage from '../../pages/preferences.page'
import SystemNotificationsPage from '../../pages/system-notifications.page'

/**
 * Notifications mobiles, sans consentement de démarche. A : acceptées, la notification arrive dans le centre de notifications et en push natif,
 * qu'on clique. B : refusées, pas de push natif (attendu 3 fois le délai mesuré en A) mais la notification est dans le centre.
 * Le push vient du backend (`tryPush`) sur les deux plateformes. Le centre est constaté dès la publication (l'inbox ouverte reçoit la notification
 * par WebSocket), puis quitté avant les opérations natives et rouvert à la fin.
 */
describe('Notifications', function () {
  // B attend 3 × le délai du push en plus des réglages et du centre de notifications.
  this.timeout(480000)
  const user = getTestUser()

  /** Délai du push natif mesuré en A, réutilisé par B. */
  let measuredPushDelayMs: number | undefined
  /** Repli si A n'a pas tourné : plus grand délai de push observé (Android). */
  const fallbackPushDelayMs = (): number => 70000
  /** Plancher et plafond de l'attente négative (le plafond reste sous le délai Mocha). */
  const NEGATIVE_WAIT_MIN_MS = 15000
  const NEGATIVE_WAIT_MAX_MS = 240000
  const MAX_CENTER_DELAY_MS = 30000
  const MAX_PUSH_DELAY_MS = 120000

  before(async function () {
    await getAppToStartingState()
  })

  /** Préférences > Notifications (écran natif « Paramètres ») : accepte ou refuse, puis ferme l'écran. */
  async function setNotifications(on: boolean): Promise<void> {
    await platform().inWebContext(async () => {
      await NavigationPage.goToRoute('/')
      await HomePage.assertHomeVisible()
      await PreferencesPage.open()
      await PreferencesPage.openPushNotificationsSettings()
    })
    expect(await SystemNotificationsPage.isAmiSettingsDisplayed()).toBe(true)
    await SystemNotificationsPage.setNotificationsFromAppSettings(on)
    await SystemNotificationsPage.closeAppSettings()
    await platform().inWebContext(() => NavigationPage.goToRoute('/'))
  }

  /** Ouvre le centre de notifications, publie (avec push) et retourne les instants utiles ; le centre reste ouvert jusqu'à l'arrivée. */
  async function publishAndWaitInCenter(title: string, body: string): Promise<{publishedAt: number, centerDelayMs: number}> {
    return await platform().inWebContext(async () => {
      await NavigationPage.goToRoute('/')
      await HomePage.assertHomeVisible()
      await NotificationsInboxPage.openFromHome()
      // Avant de publier : l'inbox ouvre son WebSocket au montage, une notification publiée plus tôt serait perdue.
      await NotificationsInboxPage.assertDisplayed()
      const publishedAt = Date.now()
      // Pas de consentement de démarche : on teste les notifications, et le partenaire AMI (système) n'en exige pas.
      await publishNotification({title, body, recipientFcHash: user.fcHash, tryPush: true, verifyPartnerConsent: false})
      await NotificationsInboxPage.assertNotificationReceived(title)
      const centerDelayMs = Date.now() - publishedAt
      // Quitter l'inbox : à la prochaine action native, le service de trace lit le source natif, que l'inbox (des centaines de notifications) bloque ~2 min sur iOS.
      await NavigationPage.goToRoute('/')
      return {publishedAt, centerDelayMs}
    })
  }

  async function assertStillInCenter(title: string): Promise<void> {
    await platform().inWebContext(async () => {
      await NavigationPage.goToRoute('/')
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
      await NotificationsInboxPage.assertNotificationReceived(title)
      await NavigationPage.goToRoute('/')
    })
  }

  it("A. notifications acceptées : push natif reçu et cliqué, notification dans le centre de notifications", async function () {
    step("A1. Accepter les notifications dans les réglages de l'app et constater la prise en compte système")
    await setNotifications(true)

    const title = `AMI-notif-A-${Date.now()}`
    const body = 'Test notifications acceptées'
    step("A2-3. Ouvrir le centre de notifications, publier la notification au backend (avec push) et la voir arriver dans le centre")
    const {publishedAt, centerDelayMs} = await publishAndWaitInCenter(title, body)
    step(`A6. Centre de notifications : notification reçue en ${(centerDelayMs / 1000).toFixed(1)} s`)
    expect(centerDelayMs).toBeLessThan(MAX_CENTER_DELAY_MS)

    step('A5. Le push natif (émis par le backend) arrive')
    await SystemNotificationsPage.waitForNativePush(title, body, MAX_PUSH_DELAY_MS * 1.25)
    measuredPushDelayMs = Date.now() - publishedAt
    step(`A5. Push natif reçu en ${(measuredPushDelayMs / 1000).toFixed(1)} s`)
    expect(measuredPushDelayMs).toBeLessThan(MAX_PUSH_DELAY_MS)

    step('A5. Cliquer la notification native et constater la page d\'arrivée')
    await SystemNotificationsPage.tapNativePush(title)
    await SystemNotificationsPage.assertPushArrival()
    await SystemNotificationsPage.leavePushArrival()
  })

  it("B. notifications refusées : aucun push natif, notification quand même dans le centre de notifications", async function () {
    step("B1. Refuser les notifications dans les réglages de l'app et constater la prise en compte système")
    await setNotifications(false)
    try {
      const title = `AMI-notif-B-${Date.now()}`
      const body = 'Test notifications refusées'
      step('B2-3. Ouvrir le centre de notifications et publier une NOUVELLE notification au backend (avec push)')
      const {centerDelayMs} = await publishAndWaitInCenter(title, body)
      expect(centerDelayMs).toBeLessThan(MAX_CENTER_DELAY_MS)

      const reference = measuredPushDelayMs ?? fallbackPushDelayMs()
      const waitMs = Math.min(NEGATIVE_WAIT_MAX_MS, Math.max(NEGATIVE_WAIT_MIN_MS, 3 * reference))
      step(`B4. Aucun push natif pendant ${(waitMs / 1000).toFixed(0)} s (3 × le délai du push mesuré en A)`)
      await SystemNotificationsPage.assertNoNativePush(title, waitMs)

      step('B5. La notification est bien dans le centre de notifications')
      await assertStillInCenter(title)
    } finally {
      step('Rétablir : notifications acceptées')
      await setNotifications(true)
    }
  })
})
