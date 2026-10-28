import logger from '@wdio/logger'
import NotificationsInboxPage from '../../pages/notifications.page'
import {publishNotification} from '../../helpers/partner-api'
import {getUser} from '../../helpers/common/test-users'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {step} from '@helpers/reporting/report'
import {platform} from '../../platform'
import NavigationPage from '../../pages/navigation.page'
import HomePage from '../../pages/home.page'
import PreferencesPage from '../../pages/preferences.page'
import SystemNotificationsPage from '../../pages/system-notifications.page'

const log = logger('test')

/**
 * Notifications mobiles (Android + iOS), SANS consentement de démarche : on teste les notifications.
 *
 * A. Notifications ACCEPTÉES : la notification publiée au backend arrive dans le centre de notifications de l'app ET en notification
 *    native (push), qu'on clique ; on constate la page d'arrivée.
 * B. Notifications REFUSÉES : la même chose, sauf que le push natif n'arrive PAS (attendu 3 fois le délai du push mesuré en A) ;
 *    la notification est quand même dans le centre de notifications.
 *
 * Le push natif vient du BACKEND sur les deux plateformes (`tryPush`) : FCM sur Android, FCM → APNs sur iOS (simulateur compris, build debug).
 * Ordre : le centre de notifications est constaté dès la publication (l'inbox doit être ouverte pour mesurer son délai et recevoir la
 * notification par WebSocket), puis on le quitte avant les opérations natives, et on le rouvre à la fin (étape 6) pour constater que la
 * notification y est restée. Le détail technique est dans SystemNotificationsPage et helpers/mobile/*-notifications.ts.
 */
describe('Notifications', function () {
  // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe. B attend 3 × le délai du push (Android : FCM 45 à 70 s
  // mesurés le 2026-10-27, donc jusqu'à ~210 s d'attente négative) en plus des réglages et du centre de notifications.
  this.timeout(480000)
  const user = getUser('avec_nom_dusage')

  /** Délai du push natif mesuré en A, réutilisé par B. */
  let measuredPushDelayMs: number | undefined
  /** Repli si A n'a pas tourné : plus grand délai observé (Android : FCM ≤ 70 s le 2026-10-27). */
  const fallbackPushDelayMs = (): number => 70000
  /** Plancher et plafond de l'attente négative (le plafond reste sous le délai Mocha). */
  const NEGATIVE_WAIT_MIN_MS = 15000
  const NEGATIVE_WAIT_MAX_MS = 240000
  /** Bornes d'assertion fondées sur les mesures (cf. rapport de l'agent). */
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
    const result = await SystemNotificationsPage.setNotificationsFromAppSettings(on)
    log.info(`notifications ${on ? 'acceptées' : 'refusées'} dans les réglages de l'app (${result})`)
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
      // Pas de consentement de démarche ici : on teste les notifications. La garde du helper (consentement du partenaire aux démarches) est levée ;
      // le partenaire AMI est un partenaire système, le backend n'exige pas son consentement (201 constaté sur staging, cf. TODO A1).
      await publishNotification({title, body, recipientFcHash: user.fcHash, tryPush: true, verifyPartnerConsent: false})
      await NotificationsInboxPage.assertNotificationReceived(title)
      const centerDelayMs = Date.now() - publishedAt
      // Quitter l'inbox : au geste natif suivant, le service de trace lit le « page source » natif ; avec l'inbox (des centaines de
      // notifications) il bloquerait la file d'Appium ~2 min sur iOS.
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
    log.info(`A : centre de notifications : ${centerDelayMs} ms après la publication`)
    step(`A6. Centre de notifications : notification reçue en ${(centerDelayMs / 1000).toFixed(1)} s`)
    expect(centerDelayMs).toBeLessThan(MAX_CENTER_DELAY_MS)

    step('A5. Le push natif (émis par le backend) arrive')
    await SystemNotificationsPage.waitForNativePush(title, body, MAX_PUSH_DELAY_MS * 1.25)
    measuredPushDelayMs = Date.now() - publishedAt
    log.info(`A : push natif : ${measuredPushDelayMs} ms après la publication au backend`)
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
      log.info(`B : centre de notifications : ${centerDelayMs} ms après la publication`)
      expect(centerDelayMs).toBeLessThan(MAX_CENTER_DELAY_MS)

      const reference = measuredPushDelayMs ?? fallbackPushDelayMs()
      const waitMs = Math.min(NEGATIVE_WAIT_MAX_MS, Math.max(NEGATIVE_WAIT_MIN_MS, 3 * reference))
      log.info(`B : attente négative ${waitMs} ms = 3 × ${reference} ms (${measuredPushDelayMs === undefined ? 'repli : A n\'a pas tourné' : 'délai mesuré en A'})`)
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
