import { withWebView, tl } from '../helpers/webview'
import { traced } from '../helpers/traced'

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

      // Sentinelle de navigation post-clic — driver.execute (pas tl()) car la navigation
      // peut être en cours (executeAsync serait tué, cf. semantic-locators.md). Le heading
      // "Notifications" confirme le rendu réel de la page, pas juste le changement d'URL
      // (le hash peut être mis à jour avant que le contenu soit rendu, cf. spa-navigation.md).
      await browser.waitUntil(
        async () => driver.execute(() =>
          Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]'))
            .some(h => h.innerText?.trim() === 'Notifications')
        ) as Promise<boolean>,
        { timeout: 15000, interval: 500, timeoutMsg: 'Heading "Notifications" absent après navigation' }
      )
    })
  }
  
  /**
   * Geste natif vers le bas pour déclencher le SwipeRefreshLayout Android.
   * Doit être appelé hors withWebView : le geste est intercepté par la WebView
   * si on est en contexte WebView, et n'atteint pas le conteneur natif.
   */
  private async pullToRefresh(): Promise<void> {
    const { width, height } = await driver.getWindowSize()
    await driver.action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25) })
      .down({ button: 0 })
      .move({ duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65) })
      .up({ button: 0 })
      .perform()
  }

  /**
   * Attend qu'un item avec ce titre exact apparaisse dans l'inbox.
   * Lance si le délai est dépassé (notification non reçue).
   *
   * Stratégie : backoff exponentiel, un withWebView minimal par tentative.
   * Entre deux withWebView, le contexte repasse en NATIVE_APP : le debugger CDP
   * se détache de la WebView, dont l'event loop redevient libre de traiter les
   * messages WebSocket entrants. Si la notification n'arrive pas après tous les
   * paliers, un fallback navigation aller-retour force un rechargement HTTP de
   * la liste au onMount du composant Svelte.
   * Mettre NOTIF_REQUIRE_WEBSOCKET=1 pour désactiver le fallback.
   */
  async waitForNotification(title: string, timeoutMs = NOTIF_DELIVERY_TIMEOUT_MS): Promise<void> {
    const backoffMs = [500, 1000, 2000, 4000, 8000]
    let elapsed = 0
    for (const delay of backoffMs) {
      await browser.pause(delay) // hors withWebView : WebView libre de recevoir la WebSocket
      elapsed += delay
      const found = await withWebView(() =>
        tl().findByText(title, {}, { timeout: 500 }).then(() => true).catch(() => false)
      )
      if (found) {
        console.log(`[notifications] reçue via WebSocket (≤ ${elapsed} ms)`)
        return
      } else {
        console.log(`[notifications] toujours pas reçue  (≤ ${elapsed} ms)`)
      }
    }

    if (!NOTIF_NAV_FALLBACK) {
      await withWebView(async () => { await tl().findByText(title, {}, { timeout: timeoutMs }) })
      return
    }

    // Fallback : pull-to-refresh natif pour forcer un rechargement API de la liste.
    // La notification est déjà persistée côté backend (publishNotification est synchrone).
    // Le geste doit être exécuté en contexte NATIVE_APP (hors withWebView) pour atteindre
    // le SwipeRefreshLayout Android qui enveloppe la WebView.
    console.warn('[notifications] non reçue via WebSocket — fallback pull-to-refresh (NOTIF_REQUIRE_WEBSOCKET=1 pour désactiver)')

    if (driver.isIOS) {
      // la WKWebView a peut-être un UIRefreshControl qui bloque le refresh avec swipe down (pullToRefresh)
      await withWebView(async () => {
        await driver.execute(() => window.location.reload())
        // Attendre la fin du reload AVANT de sortir de ce withWebView : sinon le prochain
        // withWebView() (ligne suivante) relance un executeAsync (tl().findByText) pendant que
        // la page est encore en unload/reload — "Detected a page unload event" puis
        // StaleElementReferenceError en cascade (observé en usage réel iOS, cf. webview-quirks.md).
        // await browser.waitUntil(
        //   async () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
        //   { timeout: 10000, timeoutMsg: 'Rechargement iOS non terminé en 10s' }
        // )
      })
    } else {
      await this.pullToRefresh()
    }

    // driver.execute (pas tl()) : même après readyState==='complete', la SPA Svelte peut
    // encore se réhydrater et déclencher une navigation interne (redirection du routeur,
    // reconnexion WebSocket) — un executeAsync lancé à ce moment produit la même erreur
    // "Detected a page unload event" que le reload lui-même (observé en usage réel iOS).
    // driver.execute survit à ces navigations et le waitUntil retente à chaque poll.
    await withWebView(async () => {
      await browser.waitUntil(
        async () => driver.execute((t: string) => document.body.innerText.includes(t), title) as Promise<boolean>,
        { timeout: timeoutMs, interval: 500, timeoutMsg: `"${title}" non visible après rechargement (${timeoutMs}ms)` }
      )
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
   * Utilise driver.execute plutôt que $$()/.getText() : la page notifications reçoit des
   * mises à jour WebSocket en continu (cf. waitForNotification) — un $$() suivi de .getText()
   * par élément laisse une fenêtre entre la capture de la liste et sa lecture, pendant laquelle
   * le DOM peut se re-rendre et invalider les handles ("stale element", cf. semantic-locators.md
   * §"$$() + .getText()" pour le cas général où driver.execute reste préférable).
   * driver.execute lit tout dans le même instantané JS synchrone, pas de fenêtre de staleness.
   * Utilise driver.execute plutôt que getByRole({ level: 1 }) également car la SPA AMI utilise
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

export default traced(new NotificationsInboxPage(), 'NotificationsInboxPage')
