import { withWebView, tl } from '../helpers/webview'

// Timeout pour l'assertion post-push (le backend peut mettre quelques secondes à délivrer)
const NOTIF_DELIVERY_TIMEOUT_MS = 20000

class NotificationsInboxPage {
  /**
   * Ouvre l'inbox en tapant l'icône cloche dans la WebView SPA,
   * puis attend que le hash d'URL /#/notifications soit atteint.
   * Pré-condition : l'onboarding notifications a déjà été refusé.
   */
  async openFromHome(): Promise<void> {
    await withWebView(async () => {
      // getByRole('link') cible l'<a href="/#/notifications"> par son rôle ARIA et son
      // nom accessible — plus robuste que le sélecteur CSS structurel '#notification-icon a'.
      const bell = await tl().getByRole('link', { name: /notifications/i })
      await bell.waitForDisplayed({ timeout: 15000 })
      await bell.click()

      await browser.pause(500)
      const hash = await driver.execute(() => window.location.hash) as string

      // Sur iOS/WKWebView, le clic sur <a> via WKRDP ne déclenche pas toujours la navigation —
      // fallback : forcer le hash directement pour contourner la limitation WKWebView.
      if (!hash.includes('/notifications')) {
        await driver.execute(() => { window.location.hash = '/notifications' })
      }

      await browser.waitUntil(
        async () => {
          const h = await driver.execute(() => window.location.hash) as string
          return h.includes('/notifications')
        },
        { timeout: 15000, interval: 500, timeoutMsg: 'page /#/notifications non atteinte en 15s' }
      )
    })
  }

  /**
   * Retourne l'aria-label du premier item de l'inbox, ou '' si la liste est vide.
   * Utilise JS execute : les notifications ont aria-label = titre, mais les labels de nav
   * (Retour, Gérer) sont exclus via une liste de blocage.
   */
  async getTopNotificationTitle(): Promise<string> {
    return withWebView(async () => {
      try {
        const title = await driver.execute(() => {
          const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
          const el = Array.from(document.querySelectorAll<Element>('[aria-label]')).find(
            (e) => !EXCLUDED.has(e.getAttribute('aria-label') ?? '')
          )
          return el?.getAttribute('aria-label') ?? ''
        }) as string
        return title
      } catch {
        return ''
      }
    })
  }

  /**
   * Rafraîchit l'inbox via window.location.reload() dans la WebView.
   * Le geste natif (swipe DOWN en NATIVE_APP) ne déclenche pas forcément
   * le pull-to-refresh JS de la SPA (dépend de l'implémentation Svelte/native).
   * Un reload WebView garantit un fetch serveur complet.
   */
  async pullToRefresh(): Promise<void> {
    await withWebView(async () => {
      await driver.execute(() => { window.location.reload() })
    })
    // Attendre que la SPA recharge et rende la nouvelle liste
    await browser.pause(3000)
  }

  /**
   * Attend qu'un item avec ce titre exact apparaisse dans l'inbox.
   * Lance si le délai est dépassé (notification non reçue).
   *
   * findByText() est l'équivalent sémantique du XPath normalize-space(.) précédent :
   * il trouve l'élément par son texte visible, indépendamment de la structure DOM.
   */
  async waitForNotification(title: string, timeoutMs = NOTIF_DELIVERY_TIMEOUT_MS): Promise<void> {
    await withWebView(async () => {
      await tl().findByText(title, {}, { timeout: timeoutMs })
    })
  }
}

export default new NotificationsInboxPage()
