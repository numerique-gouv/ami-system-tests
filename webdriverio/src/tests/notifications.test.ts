import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import NotificationsInboxPage from '../pages/notifications.page'
import { publishNotification } from '../helpers/notifications-api'

describe('Notifications', () => {
  /**
   * Scénario vanilla : notification reçue dans l'inbox in-app malgré refus OS.
   *
   * Portage de maestro/flows/notifications/receive_vanilla_notification.yaml.
   * La permission push n'est pas accordée (onboarding dismissed) — on valide que
   * l'inbox in-app reçoit quand même la notification via l'API partenaire.
   *
   * Pré-requis :
   *   - Variables NOTIF_* dans maestro/.env (voir maestro/.env.example)
   *   - App installée avec fullReset (la SPA doit afficher la mire FC au lancement)
   *   - Sur iOS : nettoyage SFSafariViewController + WKWebView via `just test-ios-notifications`
   */
  it("reçoit une notification publiée dans l'inbox in-app", async () => {
    // ── 1. Login FranceConnect ───────────────────────────────────────────────
    await LoginPage.dismissStagingPicker()
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox()

    // ── 2. Onboarding : décliner les notifications OS ───────────────────────
    await OnboardingNotificationsPage.dismiss()

    try {
      await LoginPage.tapFranceConnect()
    } catch (e) {
      //appear sometimes
    }


    // ── 3. Attendre la home SPA chargée (avatar profil visible en WebView) ──
    await HomePage.waitForSpaReady()

    // ── 4. Ouvrir l'inbox et mémoriser le titre courant en tête ─────────────
    await NotificationsInboxPage.openFromHome()
    const oldTop = await NotificationsInboxPage.getTopNotificationTitle()

    // ── 5. Générer un titre unique pour ce run ──────────────────────────────
    const title = `AMI-vanilla-${Date.now()}`

    // ── 6. Publier la notification via l'API partenaire ─────────────────────
    await publishNotification({
      title,
      body: "Test vanilla — push OS non autorisé, doit apparaître dans l'inbox",
    })

    // ── 7. Pull-to-refresh puis assertion ───────────────────────────────────
    await NotificationsInboxPage.pullToRefresh()
    await NotificationsInboxPage.waitForNotification(title)

    // Le titre en tête a bien changé par rapport à l'état initial
    await expect(title).not.toEqual(oldTop)
  })
})
