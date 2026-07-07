import { getSettingsLocators } from './locators/settings.locators'
import { traced } from '../helpers/traced'
import { getLoginLocators } from './locators/login.locators'

class SettingsPage {
  /**
   * Tape le bouton "Se déconnecter" sur l'écran natif Paramètres
   * puis attend que l'écran de connexion FranceConnect soit visible.
   *
   * Précondition : être sur l'écran natif Paramètres (après ProfilePage.navigateToSettings()).
   * L'écran Paramètres est entièrement natif — pas de withWebView ici.
   */
  async logout(): Promise<void> {
    const loc = getSettingsLocators()
    const loginLoc = getLoginLocators()

    await $(loc.logoutButton).waitForDisplayed({ timeout: 5000 })
    await $(loc.logoutButton).click()

    // Après déconnexion, l'écran de login doit réapparaître.
    // Sur Android, le bouton FC est natif ; sur iOS, il est dans la WebView.
    if (loginLoc.fcButtonInWebView) {
      // iOS : attendre que la WebView et le bouton FC soient présents
      await browser.waitUntil(
        async () => {
          try {
            const contexts = await driver.getContexts() as string[]
            return contexts.some(c => c.startsWith('WEBVIEW_'))
          } catch { return false }
        },
        { timeout: 15000, interval: 500, timeoutMsg: 'WebView de login non disponible après déconnexion (iOS)' }
      )
    } else {
      // Android : bouton FC natif
      await $(loginLoc.fcButton).waitForDisplayed({ timeout: 15000 })
    }
  }
}

export default traced(new SettingsPage(), 'SettingsPage')
