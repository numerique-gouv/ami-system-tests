import { withWebView, tl, pullToRefresh } from '../helpers/webview'
import { traced } from '../helpers/traced'
import { getDemarchesLocators } from './locators/demarches.locators'
import HomePage from './home.page'

const DEMARCHES_TIMEOUT_MS = 20000

class DemarchesPage {
    /**
     * Attend que la démarche identifiée par son titre apparaisse sur la page Suivi courante.
     * Pré-condition : déjà sur la page Suivi (appeler `HomePage.ouvreSuivi()` avant).
     *
     * Backend sans push testé (cf. CONTRIBUTING.md §3 "Attendre une information asynchrone") :
     * poll par backoff exponentiel avec rafraîchissement explicite à chaque tentative — même
     * stratégie que `NotificationsInboxPage.waitForNotification`. `tl().findByText()` avec
     * timeout court : le titre d'une carte est un seul nœud de texte (contrairement à
     * `assertVisibleDemarcheWith`, qui a besoin de lire le badge/lien voisins via `$$()`) —
     * une correspondance exacte par texte visible convient, pas besoin de sous-chaîne manuelle.
     */
    async waitForDemarche(title: string): Promise<void> {
        const backoffMs = [0, 500, 1000, 2000, 4000, 4000, 8000]
        for (const delay of backoffMs) {
            await browser.pause(delay) // hors withWebView : laisse la page respirer entre deux rafraîchissements
            await withWebView(async () => {
                await driver.execute(() => window.location.reload())
                await browser.waitUntil(
                    () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
                    {timeout: 5000, interval: 200, timeoutMsg: 'Page Suivi non stabilisée après reload'}
                )
            })
            const found = await withWebView(
                () => driver.execute((t: string) => document.body.innerText.includes(t), title) as Promise<boolean>
                //tl().findByText(title, {}, {timeout: 500}).then(() => true).catch(() => false)
            )

            if (found) return
        }
        throw new Error(`Démarche "${title}" non visible sur le Suivi après ${backoffMs.reduce((a, b) => a + b, 0)}ms`)
    }

  /**
   * Attend qu'une carte de démarche visible corresponde à `title`, `statusLabel` et,
   * si fourni, `expectedUrl` (lien externe). `expectedUrl` à `null` ignore ce critère.
   *
   * $$()/card.$() plutôt que tl() : on ne sait pas à l'avance quelle carte contient `title`,
   * il faut donc lire le titre de chaque carte pour le comparer. Une fois la bonne carte
   * trouvée, lire le badge/lien voisins nécessiterait de remonter du titre vers son parent
   * avec tl() — traversée interdite par CLAUDE.md. $$() donne directement la carte, badge
   * et lien se lisent dedans sans remonter le DOM.
   *
   * Les 3 critères (titre, statut, URL) sont vérifiés dans le même `waitUntil` avec un seul
   * `failReason`, plutôt que 3 méthodes séparées à un critère chacune : ça évite de reparcourir
   * la liste de cartes 3 fois, et le message d'échec pointe précisément lequel des 3 critères
   * n'a jamais été atteint (au lieu d'un "timeout" générique sur le dernier appel).
   */
  async assertVisibleDemarcheWith(
    title: string,
    statusLabel: string,
    expectedUrl: string | null,
    timeoutMs = DEMARCHES_TIMEOUT_MS
  ): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      let failReason: 'card-not-found' | 'status-not-found' | 'url-not-found' = 'card-not-found'
      let lastStatus: string | null = null
      let lastHref: string | null = null
      const statusLabelLower = statusLabel.toLowerCase()
      try {
        await browser.waitUntil(
          async () => {
            failReason = 'card-not-found'
            lastStatus = null
            lastHref = null
            for await (const card of $$(loc.cardContent)) {
              const titleText = await card.$(loc.cardTitle).getText().catch(() => '')
              if (!titleText.includes(title)) continue
              failReason = 'status-not-found'
              lastStatus = (await card.$(loc.cardBadge).getText().catch(() => '')).trim().toLowerCase()
              if (!lastStatus.includes(statusLabelLower)) return false
              if (expectedUrl === null) return true
              failReason = 'url-not-found'
              lastHref = await card.$(loc.cardLink).getAttribute('href').catch(() => null)
              return lastHref !== null && lastHref.includes(expectedUrl)
            }
            return false
          },
          {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: `Démarche "${title}" (statut "${statusLabel}"${expectedUrl ? `, URL "${expectedUrl}"` : ''}) non trouvée après ${timeoutMs}ms`
          }
        )
      } catch {
        if (failReason === 'card-not-found')
          throw new Error(`Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms`)
        if (failReason === 'status-not-found')
          throw new Error(`Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastStatus})`)
        throw new Error(`URL externe "${expectedUrl}" non trouvée pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastHref})`)
      }
    })
  }

  /**
   * Retourne sur la page d'accueil en cliquant sur le lien "Accueil" visible dans la nav.
   */
  async goToHome(): Promise<void> {
    await withWebView(async () => {
      const accueil = await tl().getByRole('link', { name: /Accueil/i })
      await accueil.waitForDisplayed({ timeout: 10000 })
      await accueil.click()
    })
    await HomePage.isHomeVisible(15000)
  }
}

export default traced(new DemarchesPage(), 'DemarchesPage')
