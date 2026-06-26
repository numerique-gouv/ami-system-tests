import { fcpLocators } from './locators/franceconnect.locators'
import { withWebView, refreshAxTree, tl } from '../helpers/webview'
import type { TestUser } from '../helpers/test-users'

class FranceConnectPage {
  /**
   * Sélectionne le niveau d'assurance eiDAS "faible" si la page de sélection est visible.
   * No-op si le serveur staging a déjà pré-sélectionné le niveau ou si iOS auto-complète.
   * Doit être appelé dans un contexte WebView (ou via withWebView).
   */
  async selectEidasFaible(): Promise<void> {
    try {
      await refreshAxTree()
      const eidasLink = await tl().getByRole('link', { name: new RegExp(fcpLocators.eidasFaibleLabel, 'i') }).catch(() => null)
      if (!eidasLink) return
      await driver.execute(() => window.scrollTo(0, 0))
      await eidasLink.click()
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
    if (driver.isIOS) {
      // Sur iOS/WKWebView, la commande WebDriver findElement ne fonctionne pas sur fip1-low
      // même dans un contexte WKRDP frais (confirmé : waitForExist et waitForDisplayed échouent
      // alors que getBoundingClientRect = 320×44 et driver.execute trouve les champs).
      // driver.execute() bypass le protocole WebDriver et parle directement au runtime JS.
      const filled = await driver.execute(
        (id: string, pwd: string) => {
          const idEl  = document.querySelector<HTMLInputElement>('#login')
          const pwdEl = document.querySelector<HTMLInputElement>('#password')
          if (!idEl || !pwdEl) return false
          idEl.focus();  idEl.value  = id;  idEl.dispatchEvent(new Event('input', { bubbles: true }))
          pwdEl.focus(); pwdEl.value = pwd; pwdEl.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        },
        identifier,
        password
      ) as boolean
      if (!filled) throw new Error('#login ou #password introuvables sur iOS')
      return
    }
    // Android : interaction standard via WebDriver (findElement + setValue)
    const idField  = $(fcpLocators.identifierField)
    const pwdField = $(fcpLocators.passwordField)
    await idField.waitForExist({ timeout: 10000 })
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
    // driver.execute() contourne le hit-testing : un overlay natif (clavier, toolbar Android)
    // ne peut pas intercepter un clic JS synthétique, contrairement à browser.keys('Return').
    await driver.execute(() => {
      const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]')
      btn?.click()
    })
    const urlBeforeSubmit = await driver.getUrl().catch(() => '')
    await browser.waitUntil(
      async () => (await driver.getUrl().catch(() => urlBeforeSubmit)) !== urlBeforeSubmit,
      { timeout: 15000, interval: 300, timeoutMsg: 'Redirect OIDC post-submit non détecté en 15s' }
    )
  }

  /**
   * Login complet avec le compte sandbox FranceConnect staging.
   * Chaîne : sélection eiDAS → remplissage formulaire FCP-LOW → soumission.
   *
   * Un seul withWebView couvre tout le flow OIDC (SPA → fcp-low → fip1-low).
   * Sur iOS/WKWebView, sortir du contexte WEBVIEW après une navigation cross-origin
   * rend le contexte WKRDP non-ré-inspectable (waitForWebViewContext bloque 25s).
   * Les interactions sur fip1-low utilisent driver.execute() car $() échoue
   * après plusieurs redirections cross-origin (bug WKRDP connu sur iOS).
   */
  async loginWithSandbox(user: TestUser): Promise<void> {
    await withWebView(async () => {
      // Sur iOS, le bouton FC est dans la WebView SPA : la navigation vers le serveur FC
      // est asynchrone — on attend que l'URL quitte la SPA avant de chercher la page eIDAS.
      // Sur Android, tapFranceConnect() clique un bouton natif : la WebView est déjà sur la
      // page eIDAS quand on arrive ici, donc spaUrl serait l'URL eIDAS et le waitUntil
      // attendrait 15s pour rien (il guetterait une navigation qui n'arrive qu'après selectEidasFaible).
      if (driver.isIOS) {
        const spaUrl = await driver.getUrl().catch(() => '')
        if (spaUrl) {
          await browser.waitUntil(
            async () => (await driver.getUrl().catch(() => spaUrl)) !== spaUrl,
            { timeout: 15000, interval: 300, timeoutMsg: 'Navigation depuis la SPA non détectée en 15s' }
          ).catch(() => {})
        }
      }

      await this.selectEidasFaible()
      try {
        await refreshAxTree()
        await this.fillCredentials(user.login, user.password)
        await this.submit()
      } catch {
        // Erreur transitoire sur la page credentials — ignorée
      }
    })
  }
}

export default new FranceConnectPage()
