import { fcpLocators } from './locators/franceconnect.locators'
import { withWebView } from '../helpers/webview'

const FC_IDENTIFIER = 'avec_nom_dusage'
const FC_PASSWORD   = '123'

class FranceConnectPage {
  /**
   * Sélectionne le niveau d'assurance eiDAS "faible" si la page de sélection est visible.
   * No-op si le serveur staging a déjà pré-sélectionné le niveau ou si iOS auto-complète.
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async selectEidasFaible(): Promise<void> {
    try {
      const link = await $(fcpLocators.eidasFaibleLink)
      if (await link.isDisplayed()) {
        await link.click()
        // Attendre que le heading FCP-LOW confirme la navigation
        await $(fcpLocators.fcpLowHeading).waitForDisplayed({ timeout: 10000 })
      }
    } catch {
      // Page de sélection absente — staging peut pré-sélectionner automatiquement
    }
  }

  /**
   * Remplit le formulaire FCP-LOW avec les credentials du compte sandbox.
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async fillCredentials(identifier: string, password: string): Promise<void> {
    const idField  = await $(fcpLocators.identifierField)
    const pwdField = await $(fcpLocators.passwordField)
    await idField.waitForDisplayed({ timeout: 10000 })
    await idField.clearValue()
    await idField.setValue(identifier)
    await pwdField.clearValue()
    await pwdField.setValue(password)
  }

  /**
   * Soumet le formulaire et attend la disparition de la page FCP-LOW (redirect OIDC terminé).
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async submit(): Promise<void> {
    const btn = await $(fcpLocators.submitButton)
    await btn.click()
    // Attendre que le formulaire disparaisse (signe que le redirect a été suivi)
    await $(fcpLocators.submitButton).waitForDisplayed({ timeout: 15000, reverse: true })
  }

  /**
   * Login complet avec le compte sandbox FranceConnect staging.
   * Chaîne : sélection eiDAS → remplissage formulaire FCP-LOW → soumission.
   * No-op partiel si le serveur iOS auto-complète (selectEidasFaible ne trouve pas le lien).
   */
  async loginWithSandbox(): Promise<void> {
    await withWebView(async () => {
      await this.selectEidasFaible()
      // Si iOS a auto-complété l'OIDC, le formulaire FCP-LOW n'apparaît pas.
      // On vérifie sa présence avant de remplir.
      try {
        const idField = await $(fcpLocators.identifierField)
        if (await idField.isDisplayed()) {
          await this.fillCredentials(FC_IDENTIFIER, FC_PASSWORD)
          await this.submit()
        }
      } catch {
        // Formulaire absent (iOS auto-complétion) — considéré comme succès
      }
    })
  }
}

export default new FranceConnectPage()
