import { getSettingsLocators } from './locators/settings.locators'

class SettingsPage {
  async isVisible(): Promise<boolean> {
    const loc = getSettingsLocators()
    return (await $(loc.screenRoot)).isDisplayed()
  }

  async waitForVisible(timeout = 10000): Promise<void> {
    const loc = getSettingsLocators()
    await $(loc.screenRoot).waitForDisplayed({ timeout })
  }

  async getTitle(): Promise<string> {
    const loc = getSettingsLocators()
    return (await $(loc.screenTitle)).getText()
  }

  async getVersionLabel(): Promise<string> {
    const loc = getSettingsLocators()
    return (await $(loc.versionLabel)).getText()
  }

  async isNotificationsToggleEnabled(): Promise<boolean> {
    const loc = getSettingsLocators()
    const toggle = await $(loc.notificationsToggle)
    // Sur iOS le toggle expose `value`, sur Android `checked`
    if (driver.isIOS) {
      return (await toggle.getAttribute('value')) === '1'
    }
    return (await toggle.getAttribute('checked')) === 'true'
  }

  async toggleNotifications(): Promise<void> {
    const loc = getSettingsLocators()
    await (await $(loc.notificationsToggle)).click()
  }

  async openAbout(): Promise<void> {
    const loc = getSettingsLocators()
    await (await $(loc.aboutButton)).click()
  }
}

export default new SettingsPage()
