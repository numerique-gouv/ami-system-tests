import NotificationsInboxPage from '../../pages/notifications.page'
import { PARTNER_AMI, getBackendUrl, grantDemarchesConsent, publishNotification } from '../../helpers/partner-api'
import { getUser } from '../../helpers/test-users'
import { getAppToStartingState } from '../../pages/authenticate.process'
import {step} from '@helpers/report'
import {platform} from '../../platform'
import {pushAndTapBanner, waitForNotificationAuthorization, waitForNotificationsRoute} from '../../helpers/ios-notifications'

describe('Notifications', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  const user = getUser('avec_nom_dusage')

  before(async function () {
    await getAppToStartingState()
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
  })

  /**
   * Scénario vanilla : notification reçue dans l'inbox in-app malgré refus OS.
   *
   * Portage de maestro/flows/notifications/receive_vanilla_notification.yaml.
   * La permission push n'est pas accordée (onboarding dismissed) — on valide que
   * l'inbox in-app reçoit quand même la notification via l'API partenaire.
   *
   * Pré-requis :
   *   - Variables NOTIF_* dans .env (voir .env.example)
   *   - App installée avec fullReset (la SPA doit afficher la mire FC au lancement)
   *   - Sur iOS : nettoyage SFSafariViewController + WKWebView via `just test-ios`
   */
  it("reçoit une notification publiée dans l'inbox in-app", async function() {
    // La livraison WebSocket Android (~22 s) reste dans le timeout Mocha global (120 s)
    // Tout le corps reste dans la WebView. En contexte natif, le service de trace (devtools) demande à Appium, après chaque
    // action, le « page source » de TOUTE l'app (arbre d'accessibilité natif, calculé par WDA). Avec l'inbox ouverte (des
    // centaines de notifications, non paginées) ce cliché ne revient pas en ~2 min et, Appium exécutant les commandes une à
    // une, bloque la file : timeout de 120 s sur iOS (5 échecs sur 5 le 2026-10-15). En WebView, le service lit le DOM.
    await platform().inWebContext(async () => {
      step("1. Ouvrir l'inbox notifications")
      await NotificationsInboxPage.openFromHome()
      // Avant de publier : l'inbox ouvre son WebSocket au montage, une notification publiée plus tôt serait perdue.
      await NotificationsInboxPage.assertDisplayed()

      step("2. Publier la notification via l'API partenaire")
      const title = `AMI-vanilla-${Date.now()}`
      await publishNotification({
        title,
        body: "Test vanilla — push OS non autorisé, doit apparaître dans l'inbox",
        recipientFcHash: user.fcHash,
      })

      step('3. Vérifier la réception dans l\'inbox et vérifier son titre')
      await NotificationsInboxPage.assertNotificationReceived(title)

      step('4. Ouvrir la notification')
      await NotificationsInboxPage.clickNotification(title)
    })
  })

  /**
   * Règle (utilisateur, 2026-10-26) : notification consentie ou non, elle est reçue dans le CENTRE DE NOTIFICATIONS ; si le push est
   * consenti, on reçoit EN PLUS la notification système.
   *   - Android : notification système (permission POST_NOTIFICATIONS accordée, volet des notifications ouvert) ;
   *   - iOS : push APNs réel = APPAREIL PHYSIQUE (hors périmètre) ; sur simulateur, `xcrun simctl push` simule la notification
   *     localement (src/helpers/ios-notifications.ts) : on constate la bannière, on la clique et on vérifie que l'app ouvre /#/notifications.
   * NON ÉVALUÉ à ce jour : le test Android n'a pas été exécuté (jeton FCM de l'émulateur, accord de permission : à confirmer au premier run).
   */
  it("avec push consenti : reçue dans l'inbox ET en notification système (Android ; iOS : push simulé)", async function() {
    if (driver.isIOS) {
      // Simulation LOCALE (xcrun simctl push) : le push APNs réel sur appareil physique reste HORS PÉRIMÈTRE (jeton APNs, backend, Firebase non exercés).
      step('iOS : l\'autorisation système des notifications a été accordée (parcours d\'authentification par défaut)')
      await waitForNotificationAuthorization('authorized')
      step('iOS : pousser une notification simulée (simctl push), cliquer sa bannière SpringBoard')
      const title = `AMI-push-${Date.now()}`
      await pushAndTapBanner({title, body: 'Test push simulé — bannière système', appUrl: getBackendUrl()})
      step('iOS : le tap ouvre la page Notifications de l\'app (app_url)')
      await waitForNotificationsRoute()
      return
    }
    const appPackage = (driver.capabilities as {'appium:appPackage'?: string})['appium:appPackage'] as string
    step('1. Accorder la permission de notifications système à l\'app')
    await driver.execute('mobile: changePermissions', {action: 'grant', appPackage, permissions: ['android.permission.POST_NOTIFICATIONS']})

    const title = `AMI-push-${Date.now()}`
    await platform().inWebContext(async () => {
      step("2. Ouvrir l'inbox puis publier la notification avec push")
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
      await publishNotification({title, body: 'Test push — inbox ET notification système', recipientFcHash: user.fcHash, tryPush: true})
      step("3. Reçue dans l'inbox")
      await NotificationsInboxPage.assertNotificationReceived(title)
    })

    step('4. Affichée comme notification système (volet des notifications)')
    await driver.openNotifications()
    try {
      await $(`android=new UiSelector().textContains("${title}")`).waitForDisplayed({
        timeout: 30000, timeoutMsg: `Notification « ${title} » reçue dans l'inbox mais absente du volet des notifications système après 30000ms`,
      })
    } finally {
      await driver.pressKeyCode(4) // BACK : referme le volet
    }
  })
})
