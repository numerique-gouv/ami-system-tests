import { withWebView } from '../helpers/webview'
import { getProfileLocators } from './locators/profile.locators'

class ProfilePage {
  /**
   * Navigue vers la page "Mon profil" depuis la home :
   *   clic toggle-menu-button → attente profile-button → clic profile-button → attente conteneur profil.
   *
   * Toute la navigation est dans un seul withWebView — la page /#/profile est dans la même
   * WebView que la home, la navigation hash ne nécessite pas de re-switch de contexte.
   */
  async navigate(): Promise<void> {
    const loc = getProfileLocators()
    await withWebView(async () => {
      // 1. Ouvrir le menu avatar (initiales)
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.toggleMenuButton)

      // 2. Attendre que le bouton "Mon profil" soit présent dans le menu ouvert
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileMenuButton) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Menu avatar non ouvert — [data-testid="profile-button"] absent après 5s' }
      )

      // 3. Cliquer "Mon profil"
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.profileMenuButton)

      // 4. Attendre le conteneur de la page profil
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileContainer) as Promise<boolean>,
        { timeout: 10000, interval: 300, timeoutMsg: 'Page "Mon profil" non chargée — [data-testid="profile"] absent après 10s' }
      )
    })
  }

  /**
   * Retourne les textes des balises <b> de la section "Mon identité".
   * Ordre attendu : [nom usuel, nom de naissance, date naissance, lieu naissance].
   */
  async getIdentityBolds(): Promise<string[]> {
    const loc = getProfileLocators()
    return await withWebView(async () =>
      driver.execute((sel: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(`${sel} b`))
          .map(b => b.innerText.trim())
          .filter(Boolean)
      , loc.identitySection) as Promise<string[]>
    )
  }

  /**
   * Retourne le texte de la balise <b> de la section "Contact" (adresse email).
   */
  async getEmailBold(): Promise<string> {
    const loc = getProfileLocators()
    return await withWebView(async () =>
      driver.execute((sel: string) =>
        document.querySelector<HTMLElement>(`${sel} b`)?.innerText.trim() ?? ''
      , loc.emailSection) as Promise<string>
    )
  }

  /**
   * Retourne les textes des balises <b> de la section "Mon adresse".
   * Ordre attendu : [rue, code postal + ville].
   */
  async getAddressBolds(): Promise<string[]> {
    const loc = getProfileLocators()
    return await withWebView(async () =>
      driver.execute((sel: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(`${sel} b`))
          .map(b => b.innerText.trim())
          .filter(Boolean)
      , loc.addressSection) as Promise<string[]>
    )
  }
}

export default new ProfilePage()
