import NotificationsInboxPage from '../../pages/notifications.page'
import { PARTNER_AMI, getBackendUrl, grantDemarchesConsent, publishNotification } from '../../helpers/partner-api'
import { getUser } from '../../helpers/test-users'
import { getAppToStartingState } from '../../pages/authenticate.process'
import {step} from '@helpers/report'
import {platform} from '../../platform'
import NavigationPage from '../../pages/navigation.page'
import PreferencesPage from '../../pages/preferences.page'
import SystemNotificationsPage from '../../pages/system-notifications.page'
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

      // Quitter l'inbox AVANT la fin de l'enveloppe : au test suivant, le service de trace lit le « page source » natif de ce qui est
      // affiché ; avec l'inbox (des centaines de notifications) il bloque la file d'Appium ~2 min (cf. commentaire ci-dessus).
      await NavigationPage.goToRoute('/')
    })
  })

  /**
   * Règle (utilisateur, 2026-10-26) : notification consentie ou non, elle est reçue dans le CENTRE DE NOTIFICATIONS ; si le push est
   * consenti, on reçoit EN PLUS la notification système.
   *   - Android : notification système (permission POST_NOTIFICATIONS accordée, volet des notifications ouvert) ;
   *   - iOS : push APNs réel = APPAREIL PHYSIQUE (hors périmètre) ; sur simulateur, `xcrun simctl push` simule la notification
   *     localement (src/helpers/ios-notifications.ts) : on constate la bannière, on la clique et on vérifie que l'app ouvre /#/notifications.
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
    // Android (constats en live le 2026-10-26, émulateur API 36, staging) : l'app ne poste la notification système (FirebaseService) que si
    // POST_NOTIFICATIONS est accordée ; elle arrive ~20 s après la publication (FCM), id fixe (une nouvelle remplace la précédente) ;
    // son clic démarre MainActivity avec les extras sender/app_url/title/message (onNewIntent : visibles dans logcat ; titre = celui de la 1re notification, PendingIntent réutilisé). Constats par adb_shell
    // (`mobile: shell`, cf. helpers/android-notifications.ts). Le WebView n'est pas rechargé par ce clic quand l'app est déjà ouverte.
    step('1. Accorder la permission de notifications système à l\'app (pm grant) et partir de l\'accueil')
    await SystemNotificationsPage.grantPermission()
    await NavigationPage.goToRoute('/')

    const title = `AMI-push-${Date.now()}`
    const body = 'Test push — inbox ET notification système'
    await platform().inWebContext(async () => {
      step("2. Ouvrir l'inbox puis publier la notification avec push")
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
      await publishNotification({title, body, recipientFcHash: user.fcHash, tryPush: true})
      step("3. Reçue dans l'inbox")
      await NotificationsInboxPage.assertNotificationReceived(title)
      // Quitter l'inbox : même raison que dans le test précédent (service de trace, « page source » natif).
      await NavigationPage.goToRoute('/')
    })

    step('4. Reçue par le système (dumpsys notification : titre et texte)')
    await SystemNotificationsPage.waitForSystemNotification(title, body)

    step('5. Visible dans le volet des notifications ; le clic ramène dans l\'app avec l\'intent de la notification')
    await SystemNotificationsPage.openShadeAndTap(title)
    await SystemNotificationsPage.assertTapOpenedApp()
  })

  /**
   * Réglage « notifications » d'AMI sur Android : la page Préférences > Notifications est PROMUE EN NATIF (écran « Paramètres », un interrupteur
   * qui reflète la permission système POST_NOTIFICATIONS). Permission accordée, taper l'interrupteur n'efface pas la permission : l'app
   * ouvre les réglages SYSTÈME de ses notifications, où « All AMI … notifications » coupe/rétablit l'importance du canal et le mode appops
   * POST_NOTIFICATION (constaté par dumpsys). Le test rétablit l'état d'origine. (Le sens inverse, permission refusée -> boîte de dialogue
   * système, n'est pas exercé : révoquer la permission tue l'app.)
   */
  it('réglage Préférences > Notifications (Android) : interrupteur natif et réglages système', async function() {
    if (driver.isIOS) this.skip()
    await SystemNotificationsPage.grantPermission()
    await NavigationPage.goToRoute('/')
    step('1. Préférences > Notifications ouvre l\'écran natif « Paramètres », interrupteur actif (permission accordée)')
    await platform().inWebContext(async () => {
      await PreferencesPage.open()
      await PreferencesPage.openPushNotificationsSettings()
    })
    expect(await SystemNotificationsPage.isAmiSettingsDisplayed()).toBe(true)
    expect(await SystemNotificationsPage.amiSettingsSwitchChecked()).toBe(true)

    step('2. Taper l\'interrupteur ouvre les réglages système des notifications de l\'app')
    await SystemNotificationsPage.tapAmiSettingsSwitch()
    expect(await SystemNotificationsPage.isOsAppNotificationSettingsFocused()).toBe(true)
    try {
      step('3. Couper les notifications dans les réglages système : importance NONE et appops « ignore »')
      await SystemNotificationsPage.setOsAppNotifications(false)
      const off = await SystemNotificationsPage.osState()
      expect(off.importance).toBe('NONE')
      expect(off.appOps).toContain('ignore')
    } finally {
      step('4. Rétablir : importance par défaut et appops non « ignore »')
      await SystemNotificationsPage.setOsAppNotifications(true)
    }
    const on = await SystemNotificationsPage.osState()
    expect(on.importance).not.toBe('NONE')
    expect(on.appOps).not.toContain('ignore')
    await SystemNotificationsPage.backToApp()
    await SystemNotificationsPage.grantPermission() // filet : permission accordée pour la suite de la série
    await driver.pressKeyCode(4) // BACK : quitte l'écran natif « Paramètres »
    await NavigationPage.goToRoute('/')
  })
})
