import NotificationsInboxPage from '../../pages/notifications.page'
import { publishNotification } from '../../helpers/notifications-api'
import { getUser } from '../../helpers/test-users'
import { getAppToStartingState } from '../../pages/authenticate.process'
import {step} from '@helpers/report'

describe('Notifications', () => {
  const user = getUser('avec_nom_dusage')

  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
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
