import { withWebView, tl } from '../helpers/webview'
import { traced } from '../helpers/traced'
import { getDemarchesLocators } from './locators/demarches.locators'
import HomePage from './home.page'

const DEMARCHES_TIMEOUT_MS = 20000

class DemarchesPage {
  /**
   * Attend qu'une carte de démarche visible corresponde à `title`, `statusLabel` et,
   * si fourni, `expectedUrl` (lien externe). `expectedUrl` à `null` ignore ce critère.
   *
   * $$()/card.$() plutôt que tl() : on ne sait pas à l'avance quelle carte contient `title`,
   * il faut donc lire le titre de chaque carte pour le comparer. Une fois la bonne carte
   * trouvée, lire le badge/lien voisins nécessiterait de remonter du titre vers son parent
   * avec tl() — traversée interdite par CLAUDE.md. $$() donne directement la carte, badge
   * et lien se lisent dedans sans remonter le DOM.
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
