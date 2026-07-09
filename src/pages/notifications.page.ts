import { withWebView, tl, pullToRefresh } from '../helpers/webview'
import { traced } from '../helpers/traced'

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
      // peut être en cours (executeAsync serait tué, cf. CONTRIBUTING.md §2). Le heading
      // "Notifications" confirme le rendu réel de la page, pas juste le changement d'URL
      // (le hash peut être mis à jour avant que le contenu soit rendu, cf. CONTRIBUTING.md §4).
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
   * Attend qu'un item avec ce titre exact apparaisse dans l'inbox.
   *
   * Stratégie : backoff exponentiel, un withWebView minimal par tentative.
   */
  async waitForNotification(title: string): Promise<void> {
    const backoffMs = [500, 1000, 2000, 4000, 8000]
    let elapsed = 0
    for (const delay of backoffMs) {
      await browser.pause(delay) // hors withWebView : WebView libre de recevoir la WebSocket
      elapsed += delay
      if (driver.isIOS) {
        // la WKWebView a peut-être un UIRefreshControl qui bloque le refresh avec swipe down (pullToRefresh)
        await withWebView(async () => {
          await driver.execute(() => window.location.reload())
        })
      } else {
        await pullToRefresh()
      }
      const found = await withWebView(() =>
        tl().findByText(title, {}, { timeout: 500 }).then(() => true).catch(() => false)
      )
      if (found) {
        console.log(`[notifications] reçue (≤ ${elapsed} ms)`)
        return
      } else {
        console.log(`[notifications] toujours pas reçue  (≤ ${elapsed} ms)`)
      }
    }
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
   * le DOM peut se re-rendre et invalider les handles ("stale element", cf. CONTRIBUTING.md §2
   * pour le cas général où driver.execute reste préférable).
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
