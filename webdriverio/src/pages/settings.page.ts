import { getSettingsLocators } from './locators/settings.locators'

class SettingsPage {
  async isVisible(): Promise<boolean> {
    try {
      const loc = getSettingsLocators()
      return await $(loc.screenRoot).isDisplayed()
    } catch {
      return false
    }
  }

  async waitForVisible(timeout = 10000): Promise<void> {
    const loc = getSettingsLocators()
    await $(loc.screenRoot).waitForDisplayed({ timeout })
  }

  async getTitle(): Promise<string> {
    const loc = getSettingsLocators()
    return await $(loc.screenTitle).getText()
  }

  async getVersionLabel(): Promise<string> {
    const loc = getSettingsLocators()
    return await $(loc.versionLabel).getText()
  }

  async isNotificationsToggleEnabled(): Promise<boolean> {
    const loc = getSettingsLocators()
    // Sur iOS le toggle expose `value`, sur Android `checked`
    if (driver.isIOS) {
      return (await $(loc.notificationsToggle).getAttribute('value')) === '1'
    }
    return (await $(loc.notificationsToggle).getAttribute('checked')) === 'true'
  }

  async toggleNotifications(): Promise<void> {
    const loc = getSettingsLocators()
    await $(loc.notificationsToggle).click()
  }

  async openAbout(): Promise<void> {
    const loc = getSettingsLocators()
    await $(loc.aboutButton).click()
  }
}

export default new SettingsPage()
