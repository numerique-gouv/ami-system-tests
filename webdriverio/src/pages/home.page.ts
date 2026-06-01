import { getHomeLocators } from './locators/home.locators'
import { withWebView } from '../helpers/webview'

class HomePage {
  /** Retourne true si le conteneur WebView natif est affiché. */
  async isVisible(): Promise<boolean> {
    try {
      const loc = getHomeLocators()
      return (await $(loc.screenRoot)).isDisplayed()
    } catch {
      return false
    }
  }

  /**
   * Attend que le conteneur WebView natif soit visible.
   * L'app AMI est 100% SPA — pas de resource-id natif, on détecte la WebView elle-même.
   */
  async waitForVisible(timeout = 30000): Promise<void> {
    const loc = getHomeLocators()
    await $(loc.screenRoot).waitForDisplayed({ timeout })
  }

  /**
   * Attend que la SPA WebView soit chargée après authentification.
   *   1. Natif  : waitForVisible() détecte le conteneur WebView
   *   2. WebView : #notification-icon confirme que la SPA home authentifiée est rendue
   * Timeout long (60 s) pour couvrir le flow OIDC complet.
   */
  async waitForSpaReady(timeout = 60000): Promise<void> {
    await this.waitForVisible(timeout)
    const loc = getHomeLocators()
    await withWebView(async () => {
      await $(loc.userAvatarCss).waitForDisplayed({ timeout })
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
      return withWebView(async () => {
        const el = await $('//*[contains(., "Mon agenda") or contains(., "Mes démarches")]')
        return el.isDisplayed()
      })
    } catch {
      return false
    }
  }

  /** Ouvre le premier partenaire/item de la liste en tapant dessus dans la WebView. */
  async openFirstPartner(): Promise<void> {
    await withWebView(async () => {
      // Cible le premier lien/item cliquable dans la zone "Mes démarches"
      const item = await $('//*[@aria-label and @tabindex="0"][1]')
      await item.click()
    })
  }

  /** Navigue vers l'onglet Suivi/Paramètres via la nav WebView. */
  async goToSettings(): Promise<void> {
    await withWebView(async () => {
      const btn = await $('//*[@aria-label="Icône de suivi Suivi"]')
      await btn.click()
    })
  }
}

export default new HomePage()
