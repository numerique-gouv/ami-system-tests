import { withWebView, tl } from '../helpers/webview'

// Timeout pour l'assertion post-push.
// Sur iOS (WKRDP), la notification WebSocket arrive en ~5 s.
// Sur Android (Chromedriver/CDP), elle arrive en ~22 s — on prend une marge confortable.
const NOTIF_DELIVERY_TIMEOUT_MS = 40000

// Mettre NOTIF_REQUIRE_WEBSOCKET=1 dans l'env pour désactiver le fallback HTTP.
// En mode strict, le test échoue si la notification n'arrive pas via push temps-réel
// dans NOTIF_DELIVERY_TIMEOUT_MS — utile pour diagnostiquer la livraison WebSocket.
const NOTIF_NAV_FALLBACK = !process.env.NOTIF_REQUIRE_WEBSOCKET

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

      const hash = await driver.execute(() => window.location.hash) as string

      // Sur iOS/WKWebView, le clic sur <a> via WKRDP ne déclenche pas toujours la navigation —
      // fallback : forcer le hash directement pour contourner la limitation WKWebView.
      if (!hash.includes('/notifications')) {
        await driver.execute(() => { window.location.hash = '/notifications' })
      }

      // Exception documentée (spa-navigation.md) : la page notifications n'a pas de heading
      // identifiable — c'est une liste pure de <a>. Le hash est ici la sentinelle légitime :
      // soit le clic l'a positionné, soit le fallback vient de le forcer ; la SPA Svelte
      // re-rend synchronement après un changement de hash. Le rendu réel est confirmé
      // ensuite par waitForNotification() qui attend un item spécifique.
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
   * Attend qu'un item avec ce titre exact apparaisse dans l'inbox.
   * Lance si le délai est dépassé (notification non reçue).
   *
   * Fast-path : findByText en 5 s (suffit sur iOS, parfois sur Android).
   * Fallback (NOTIF_NAV_FALLBACK) : navigation SPA aller-retour (/#/home → /#/notifications)
   * qui déclenche un rechargement HTTP de la liste au onMount du composant Svelte — la
   * notification est déjà persistée côté backend (publishNotification est synchrone).
   * Mettre NOTIF_REQUIRE_WEBSOCKET=1 pour désactiver le fallback et forcer l'échec si
   * la livraison temps-réel ne fonctionne pas.
   */
  async waitForNotification(title: string, timeoutMs = NOTIF_DELIVERY_TIMEOUT_MS): Promise<void> {
    await withWebView(async () => {
      if (NOTIF_NAV_FALLBACK) {
        const arrived = await tl().findByText(title, {}, { timeout: 5000 }).then(() => true).catch(() => false)
        if (arrived) {
          console.log('[notifications] reçue via push temps-réel (< 5 s)')
          return
        }
        console.warn('[notifications] non reçue en 5 s — fallback navigation HTTP (NOTIF_REQUIRE_WEBSOCKET=1 pour désactiver)')
        await driver.execute(() => { window.location.hash = '/home' })
        await browser.pause(300)
        await driver.execute(() => { window.location.hash = '/notifications' })
      }
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
  async getTopNotificationTitle(): Promise<string> {
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
      // Retourne '' sur inbox vide (pas de notification antérieure) — le test gère ce cas
      // via l'assertion expect(oldTop).not.toEqual(title). Sur la page de détail après clic,
      // '' provoque un échec à l'assertion expect(newTop).toEqual(title), ce qui est correct.
      return text
    })
  }
}

export default new NotificationsInboxPage()
