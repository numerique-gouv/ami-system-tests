import { getLoginLocators } from './locators/login.locators'
import { withWebView } from '../helpers/webview'

class LoginPage {
  /**
   * Ferme le review-picker staging si visible (best-effort, no-op sinon).
   * Le picker apparaît uniquement sur les builds staging avec plusieurs review apps.
   */
  async reviewEnvironmentPicker(): Promise<void> {
    const loc = getLoginLocators()
    try {
      const picker = $(loc.stagingPicker)
      // La liste des review apps est chargée via un appel réseau asynchrone —
      // on attend qu'elle soit visible plutôt que de vérifier immédiatement.
      await picker.waitForDisplayed({ timeout: 15000 })
      await picker.click()
    } catch {
      // Élément absent — normal sur une review app sans picker
    }
  }

  /**
   * Tape le bouton "S'identifier avec FranceConnect".
   * Sur Android : bouton natif (NATIVE_APP, contentDescription).
   * Sur iOS : bouton dans la WebView SPA (context switch automatique).
   */
  async tapFranceConnect(timeoutMs = 15000): Promise<void> {
    const timeout = timeoutMs
    const loc = getLoginLocators()
    if (loc.fcButtonInWebView) {
      await withWebView(async () => {
        await $(loc.fcButton).waitForDisplayed({ timeout })
        await $(loc.fcButton).click()
      })
    } else {
      await $(loc.fcButton).waitForDisplayed({ timeout })
      await $(loc.fcButton).click()
    }
  }
}

export default new LoginPage()
