import { getHomeLocators } from './locators/home.locators'

class HomePage {
  /**
   * Vérifie que l'écran d'accueil est affiché
   */
  async isVisible(): Promise<boolean> {
    const loc = getHomeLocators()
    const el = await $(loc.screenRoot)
    return el.isDisplayed()
  }

  /**
   * Attend que le home soit chargé (utile après le lancement de l'app)
   */
  async waitForVisible(timeout = 15000): Promise<void> {
    const loc = getHomeLocators()
    await $(loc.screenRoot).waitForDisplayed({ timeout })
  }

  /**
   * Retourne le titre de la page d'accueil
   */
  async getTitle(): Promise<string> {
    const loc = getHomeLocators()
    return (await $(loc.pageTitle)).getText()
  }

  /**
   * Vérifie que la liste des partenaires est présente
   */
  async isPartnerListVisible(): Promise<boolean> {
    const loc = getHomeLocators()
    return (await $(loc.partnerList)).isDisplayed()
  }

  /**
   * Ouvre le détail du premier partenaire
   */
  async openFirstPartner(): Promise<void> {
    const loc = getHomeLocators()
    await (await $(loc.firstPartnerCard)).click()
  }

  /**
   * Navigue vers l'onglet Paramètres
   */
  async goToSettings(): Promise<void> {
    const loc = getHomeLocators()
    await (await $(loc.settingsTabButton)).click()
  }

  /**
   * Ouvre le panneau de notifications
   */
  async openNotifications(): Promise<void> {
    const loc = getHomeLocators()
    await (await $(loc.notificationBell)).click()
  }
}

export default new HomePage()
