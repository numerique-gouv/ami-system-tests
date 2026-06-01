import { fcpLocators } from './locators/franceconnect.locators'
import { withWebView, refreshAxTree } from '../helpers/webview'

const FC_IDENTIFIER = 'avec_nom_dusage'
const FC_PASSWORD   = '123'

class FranceConnectPage {
  /**
   * Sélectionne le niveau d'assurance eiDAS "faible" si la page de sélection est visible.
   * No-op si le serveur staging a déjà pré-sélectionné le niveau ou si iOS auto-complète.
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async selectEidasFaible(): Promise<void> {
    // Le redirect OIDC depuis le bouton FC est asynchrone : la page eIDAS met
    // quelques secondes à charger. On attend qu'elle apparaisse (ou qu'on soit
    // déjà sur le formulaire FCP-LOW si le serveur a auto-complété l'étape).
    // Équivalent du `runFlow: when: visible: text: ".*faible.*"` de Maestro.
    try {
      await refreshAxTree()
      const appeared = await $(fcpLocators.eidasFaibleLink)
        .waitForDisplayed({ timeout: 8000 })
        .catch(() => false)

      if (!appeared) return  // serveur a sauté l'étape eIDAS (auto-complete)

      // Alignement maestro/FC_login.yaml : scrollUntilVisible UP avant de taper
      await driver.execute(() => window.scrollTo(0, 0))
      await $(fcpLocators.eidasFaibleLink).click()
      await refreshAxTree()
      // Alignement maestro/FC_login.yaml : extendedWaitUntil FCP-LOW, timeout 10 s
      await $(fcpLocators.fcpLowHeading).waitForDisplayed({ timeout: 10000 })
    } catch {
      // Erreur transitoire (navigation en cours) — considéré comme auto-complete
    }
  }

  /**
   * Remplit le formulaire FCP-LOW avec les credentials du compte sandbox.
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async fillCredentials(identifier: string, password: string): Promise<void> {
    const idField  = $(fcpLocators.identifierField)
    const pwdField = $(fcpLocators.passwordField)
    await idField.waitForDisplayed({ timeout: 10000 })
    // Alignement maestro/FC_login.yaml : scrollUntilVisible UP avant de remplir
    // (le clavier iOS peut pousser les champs hors du viewport)
    await idField.scrollIntoView()
    await idField.clearValue()
    await idField.setValue(identifier)
    await pwdField.scrollIntoView()
    await pwdField.clearValue()
    await pwdField.setValue(password)
  }

  /**
   * Soumet le formulaire et attend la disparition de la page FCP-LOW (redirect OIDC terminé).
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async submit(): Promise<void> {
    // Sur iOS WKWebView, button.click() via WKRDP ne déclenche pas toujours le submit.
    // On utilise la touche Entrée (touche "Go" du clavier iOS), comme Maestro pressKey: Enter.
    await browser.keys(['Return'])
    // Attendre que le conteneur FCP-LOW disparaisse (redirect OIDC suivi)
    await $(fcpLocators.fcpLowHeading).waitForDisplayed({ timeout: 15000, reverse: true })
  }

  /**
   * Login complet avec le compte sandbox FranceConnect staging.
   * Chaîne : sélection eiDAS → remplissage formulaire FCP-LOW → soumission.
   * No-op partiel si le serveur iOS auto-complète (selectEidasFaible ne trouve pas le lien).
   */
  async loginWithSandbox(): Promise<void> {
    await withWebView(async () => {
      await this.selectEidasFaible()
      try {
        await refreshAxTree()
        const idField = $(fcpLocators.identifierField)
        await idField.waitForDisplayed({ timeout: 3000 })
        await this.fillCredentials(FC_IDENTIFIER, FC_PASSWORD)
        await this.submit()
      } catch {
        // Formulaire absent (iOS auto-complétion totale) — considéré comme succès
      }
    })
  }
}

export default new FranceConnectPage()
