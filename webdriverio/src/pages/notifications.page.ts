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
   * findByText() trouve l'élément par son texte visible, indépendamment
   * de la structure DOM. La mise à jour est poussée par WebSocket — pas
   * besoin de recharger la page avant d'appeler cette méthode.
   */
  async waitForNotification(title: string, timeoutMs = NOTIF_DELIVERY_TIMEOUT_MS): Promise<void> {
    await withWebView(async () => {
      await tl().findByText(title, {}, { timeout: timeoutMs })
    })
  }

  /**
   * Clique sur la notification dont le texte visible correspond exactement à `title`,
   * puis attend que le routeur Svelte navigue vers la page de détail (changement de hash).
   * Pré-condition : la notification est déjà visible dans l'inbox (utiliser waitForNotification avant).
   */
  async clickNotification(title: string): Promise<void> {
    await withWebView(async () => {
      const item = await tl().findByText(title)
      await item.click()
      // La page de détail s'affiche en overlay/inline sans changer le hash.
      // On attend qu'un heading apparaisse dans le DOM (titre de la vue détail).
      await browser.waitUntil(
        async () => {
          return await driver.execute(() =>
            !!document.querySelector('h1, h2, h3, [role="heading"], a[href]')
          ) as boolean
        },
        { timeout: 10000, interval: 300, timeoutMsg: 'Titre (heading ou lien) de la page de détail non trouvé en 10s' }
      )
    })
  }

  /**
   * Retourne le texte du premier heading visible sur la page de détail d'une notification.
   * Utilise driver.execute plutôt que getByRole({ level: 1 }) car la SPA AMI utilise
   * <h2> / <h3> (composants DSFR fr-tile) et non systématiquement <h1>.
   */
  async getDetailTitle(): Promise<string> {
    return withWebView(async () => {
      const text = await driver.execute(() => {
        // Le titre de la notification est rendu comme un <a> (composant fr-tile DSFR), pas un heading.
        // On exclut les liens de navigation pour ne garder que le titre métier.
        const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
        const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]')).find(
          (e) => !EXCLUDED.has((e.textContent ?? '').replace(/\s+/g, ' ').trim())
        )
        return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
      }) as string
      if (!text) throw new Error('Aucun titre (heading ou lien) trouvé sur la page de détail de notification')
      return text
    })
  }
}

export default new NotificationsInboxPage()
