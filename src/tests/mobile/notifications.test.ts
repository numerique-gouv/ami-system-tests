import NotificationsInboxPage from '../../pages/notifications.page'
import { grantConsent, publishNotification } from '../../helpers/partner-api'
import { getUser } from '../../helpers/test-users'
import { getAppToStartingState } from '../../pages/authenticate.process'
import {step} from '@helpers/report'
import {platform} from '../../platform'

describe('Notifications', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  const user = getUser('avec_nom_dusage')

  before(async function () {
    await getAppToStartingState()
    await grantConsent(user.fcHash)
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
})
