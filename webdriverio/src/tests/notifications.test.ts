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
    // ── 1. Login FranceConnect ──────────────────────────────────────────────────
    await LoginPage.reviewEnvironmentPicker()
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox()

    // ── 2. Onboarding : décliner les notifications OS ──────────────────────────
    await OnboardingNotificationsPage.dismiss()
    
    // Le bouton FC peut réapparaître brièvement pendant la fin du redirect OIDC (iOS)
    try {
      await LoginPage.tapFranceConnect(5000)
    } catch (e) {
      // absent dans la majorité des cas
    }

    // ── 3. Attendre la home SPA chargée (avatar profil visible en WebView) ─────
    await HomePage.waitForSpaReady()

    // ── 4. Ouvrir l'inbox ─────────────────────────────────────────────────────
    await NotificationsInboxPage.openFromHome()
    // ── 5. Générer un titre unique pour ce run ─────────────────────────────────
    const title = `AMI-vanilla-${Date.now()}`

    // ── 6. Publier la notification via l'API partenaire ────────────────────────
    await publishNotification({
      title,
      body: "Test vanilla — push OS non autorisé, doit apparaître dans l'inbox",
    })

    // ── 7. Attendre la mise à jour WebSocket puis assertion ────────────────────
    // La SPA reçoit la notification via WebSocket sans rechargement de page.
    await NotificationsInboxPage.waitForNotification(title)
    // ── 8. "Lire" la notification et vérifier son titre ────────────────────────
    await NotificationsInboxPage.clickNotification(title)
    
    // ── 9. Vérifier que le titre affiché dans la vue détail correspond au test ──
    const newTop = await NotificationsInboxPage.getDetailTitle()
    expect(newTop).toEqual(title)
  })
})
