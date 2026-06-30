import { withWebView, tl } from '../helpers/webview'
import { getDemarchesLocators } from './locators/demarches.locators'
import HomePage from './home.page'

const DEMARCHES_TIMEOUT_MS = 20000

class DemarchesPage {
  /**
   * Attend que le libellé de statut attendu soit visible sur la carte de la démarche.
   * Trouve le lien-titre dans le tabpanel courant, remonte via closest() vers la carte
   * pour lire le textContent complet (titre + statut).
   */
  async waitForItemWithStatus(title: string, statusLabel: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      let failReason: 'card-not-found' | 'status-not-found' = 'card-not-found'
      let lastContent: string | null = null
      const statusLabelLower = statusLabel.toLowerCase()
      try {
        await browser.waitUntil(
          async () => {
            lastContent = await driver.execute(
              (contentSel: string, titleSel: string, badgeSel: string, t: string) => {
                const cards = Array.from(document.querySelectorAll(contentSel))
                // textContent pour identifier la carte (texte brut, indépendant du CSS)
                // innerText pour le badge (vérifie ce que l'utilisateur voit réellement)
                const card = cards.find(c => c.querySelector(titleSel)?.textContent?.includes(t))
                if (!card) return null
                return (card.querySelector(badgeSel) as HTMLElement | null)?.innerText?.trim().toLowerCase() ?? ''
              }, loc.cardContent, loc.cardTitle, loc.cardBadge, title) as string | null
            if (lastContent === null) { failReason = 'card-not-found'; return false }
            if (!lastContent.includes(statusLabelLower)) { failReason = 'status-not-found'; return false }
            return true
          },
          { timeout: timeoutMs, interval: 2000, timeoutMsg: `Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms` }
        )
      } catch {
        if (failReason === 'card-not-found')
          throw new Error(`Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms`)
        throw new Error(`Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastContent})`)
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

  /**
   * Attend que l'URL externe de la démarche corresponde à `expectedUrl`.
   * Chaque carte étant un <a>, son href EST l'URL externe — pas de lookup intermédiaire.
   */
  async waitForItemExternalUrl(title: string, expectedUrl: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      let failReason: 'card-not-found' | 'url-not-found' = 'card-not-found'
      let lastHref: string | null = null
      try {
        await browser.waitUntil(
          async () => {
            lastHref = await driver.execute(
              (contentSel: string, titleSel: string, linkSel: string, t: string) => {
                const cards = Array.from(document.querySelectorAll(contentSel))
                const card = cards.find(c => c.querySelector(titleSel)?.textContent?.includes(t))
                if (!card) return null
                return (card.querySelector(linkSel) as HTMLAnchorElement | null)?.href ?? null
              }, loc.cardContent, loc.cardTitle, loc.cardLink, title) as string | null
            if (lastHref === null) { failReason = 'card-not-found'; return false }
            if (!lastHref.includes(expectedUrl)) { failReason = 'url-not-found'; return false }
            return true
          },
          { timeout: timeoutMs, interval: 2000, timeoutMsg: `URL "${expectedUrl}" non trouvée pour "${title}" après ${timeoutMs}ms` }
        )
      } catch {
        if (failReason === 'card-not-found')
          throw new Error(`Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms`)
        throw new Error(`URL externe "${expectedUrl}" non trouvée pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastHref})`)
      }
    })
  }
}

export default new DemarchesPage()
