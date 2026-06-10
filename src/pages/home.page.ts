import { getHomeLocators } from './locators/home.locators'
import { withWebView, tl } from '../helpers/webview'

class HomePage {
  /** Retourne true si le conteneur WebView natif est affiché. */
  async isVisible(): Promise<boolean> {
    try {
      const loc = getHomeLocators()
      return await $(loc.screenRoot).isDisplayed()
    } catch {
      return false
    }
  }

  /**
   * Attend que le conteneur WebView natif soit visible.
   * L'app AMI est 100% SPA — pas de resource-id natif, on détecte la WebView elle-même.
   */
  async waitForVisible(timeout = 30000): Promise<void> {
    const { width, height } = await driver.getWindowSize()
    await driver.action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.4) })
      .down({ button: 0 })
      .move({ duration: 300, x: Math.round(width / 2), y: Math.round(height * 0.5) })
      .up({ button: 0 })
      .perform()
    const loc = getHomeLocators()
    await $(loc.screenRoot).waitForDisplayed({ timeout })
  }

  /**
   * Attend que la SPA WebView soit chargée après authentification.
   *   1. Natif  : waitForVisible() détecte le conteneur WebView
   *   2. WebView : #notification-icon confirme que la SPA home authentifiée est rendue
   * Timeout long (60 s) pour couvrir le flow OIDC complet.
   *
   * On utilise driver.execute() (JS sync) + browser.waitUntil() plutôt que
   * tl().findByRole() (executeAsyncScript) : sur WKWebView, un async script
   * en cours est silencieusement tué si la page navigue, ce qui bloque Appium
   * indéfiniment. Le sync JS renvoie immédiatement une erreur lors d'une
   * navigation, et le try/catch dans waitUntil réessaie à l'intervalle suivant.
   */
  async waitForSpaReady(timeout = 10000): Promise<void> {
    await this.waitForVisible(timeout)
    await withWebView(async () => {
      await browser.waitUntil(
        async () => {
          try {
            return await driver.execute(
              () => !!document.querySelector('#notification-icon a[href]')
            ) as boolean
          } catch {
            return false
          }
        },
        { timeout, interval: 1000, timeoutMsg: `SPA home non prête — #notification-icon absent après ${timeout}ms` }
      )
    })
  }

  /** Retourne le titre du document SPA (tag <title> HTML). */
  async getTitle(): Promise<string> {
    return withWebView(async () => {
      return (await driver.execute(() => document.title)) as string
    })
  }

  /** Vérifie si la liste "Mon agenda" ou "Mes démarches" est visible dans la SPA. */
  async isPartnerListVisible(): Promise<boolean> {
    try {
      return await withWebView(async () => {
        const el = await tl().findByText(/mon agenda|mes démarches/i, {}, { timeout: 5000 }).catch(() => null)
        return el ? await el.isDisplayed() : false
      })
    } catch {
      return false
    }
  }

  /** Ouvre le premier partenaire/item de la liste en tapant dessus dans la WebView. */
  async openFirstPartner(): Promise<void> {
    await withWebView(async () => {
      const item = $('//*[@aria-label and @tabindex="0"][1]')
      await item.click()
    })
  }

  /** Navigue vers l'onglet Suivi/Paramètres via la nav WebView. */
  async goToSettings(): Promise<void> {
    await withWebView(async () => {
      await (await tl().getByRole('link', { name: /suivi/i })).click()
    })
  }
}

export default new HomePage()
