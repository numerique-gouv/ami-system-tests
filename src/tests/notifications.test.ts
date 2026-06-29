import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import NotificationsInboxPage from '../pages/notifications.page'
import { publishNotification } from '../helpers/notifications-api'
import { getUser } from '../helpers/test-users'

describe('Notifications', () => {
  before(async () => {
    await AllureReporter.addFeature('Notifications')
    await AllureReporter.addSeverity('critical')
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
   *   - Sur iOS : nettoyage SFSafariViewController + WKWebView via `just test-ios-notifications`
   */
  it("reçoit une notification publiée dans l'inbox in-app", async function() {
    // Le login FranceConnect (~80 s) + la livraison WebSocket Android (~22 s) dépassent
    // le timeout Mocha global (120 s). On étend localement sans toucher au seuil global.
    this.timeout(180000)
    const user = getUser('avec_nom_dusage')

    await AllureReporter.addStep('1. Login FranceConnect')
    await LoginPage.reviewEnvironmentPicker()
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox(user)

    await AllureReporter.addStep('2. Onboarding : décliner les notifications OS')
    await OnboardingNotificationsPage.dismiss()

    // Le bouton FC peut réapparaître brièvement pendant la fin du redirect OIDC (iOS)
    try {
      await LoginPage.tapFranceConnect(1000)
    } catch {
      // absent dans la majorité des cas
    }

    await AllureReporter.addStep('3. Attendre la home SPA chargée')
    await HomePage.isHomeVisible(60000)

    await AllureReporter.addStep("4. Ouvrir l'inbox notifications")
    await NotificationsInboxPage.openFromHome()
    const oldTop = await NotificationsInboxPage.getTopNotificationTitle()

    await AllureReporter.addStep("5. Publier la notification via l'API partenaire")
    const title = `AMI-vanilla-${Date.now()}`
    await publishNotification({
      title,
      body: "Test vanilla — push OS non autorisé, doit apparaître dans l'inbox",
      recipientFcHash: user.fcHash,
    })

    await AllureReporter.addStep('6. Vérifier la réception dans l\'inbox (WebSocket)')
    // La SPA reçoit la notification via WebSocket sans rechargement de page.
    await NotificationsInboxPage.waitForNotification(title)

    await AllureReporter.addStep('7. Ouvrir la notification et vérifier son titre')
    await NotificationsInboxPage.clickNotification(title)
    const newTop = await NotificationsInboxPage.getTopNotificationTitle()
    expect(oldTop).not.toEqual(title)
    expect(newTop).toEqual(title)
  })
})
