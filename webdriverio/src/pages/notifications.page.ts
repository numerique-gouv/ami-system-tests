import { notificationsLocators, notifItemXpath } from './locators/notifications.locators'
import { withWebView } from '../helpers/webview'

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
      const bell = $(notificationsLocators.bellCss)
      await bell.waitForDisplayed({ timeout: 15000 })
      // Chromedriver click sur #notification-icon (pointer events complets, bubbling vers le bouton parent)
      // — déclenche le router Svelte. Un click() DOM synthétique via driver.execute() ne suffit pas.
      await bell.click()
      // Attend la navigation SPA vers /#/notifications (hash routing Svelte)
      await browser.waitUntil(
        async () => {
          const hash = await driver.execute(() => window.location.hash) as string
          return hash.includes('/notifications')
        },
        { timeout: 15000, interval: 500, timeoutMsg: 'inbox /#/notifications non atteint en 15s' }
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
   */
  async waitForNotification(title: string, timeoutMs = NOTIF_DELIVERY_TIMEOUT_MS): Promise<void> {
    await withWebView(async () => {
      await $(notifItemXpath(title)).waitForDisplayed({ timeout: timeoutMs })
    })
  }
}

export default new NotificationsInboxPage()
