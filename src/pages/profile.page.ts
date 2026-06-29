import { tl, withWebView } from '../helpers/webview'
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

  /**
   * Navigue directement vers /#/profile via le hash SvelteKit.
   * Utilisable depuis n'importe quelle page d'édition ou après un échec de test.
   */
  async navigateToProfileDirect(): Promise<void> {
    const loc = getProfileLocators()
    await withWebView(async () => {
      await driver.execute(() => { window.location.hash = '/profile' })
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Page profil non chargée après navigation directe par hash' }
      )
    })
  }

  /**
   * Ouvre le formulaire d'édition du nom d'usage, saisit la valeur, enregistre,
   * et attend le retour sur la page profil.
   *
   * Pattern : driver.execute pour les sentinelles de navigation (nav active = executeAsync tué),
   * tl() pour les interactions sur la page stable (sémantique + résiliente aux refactorings DOM).
   */
  async editPreferredUsername(newValue: string): Promise<void> {
    const loc = getProfileLocators()
    await withWebView(async () => {
      // Clic "Modifier" : data-testid requis, les 3 boutons ont le même texte "Modifier"
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.preferredUsernameEditButton)

      // Sentinelle : attendre que le formulaire soit rendu (driver.execute, nav active)
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.editContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Formulaire "Mon identité" non chargé après clic Modifier' }
      )

      // Page stable → tl() : label "Nom d'usage" associé à l'input via for/id
      const input = await tl().findByLabelText("Nom d'usage")
      await input.setValue(newValue)

      const submitBtn = await tl().findByRole('button', { name: 'Enregistrer' })
      await submitBtn.click()

      // Sentinelle retour profil
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Page profil non affichée après enregistrement du nom d\'usage' }
      )
    })
  }

  /**
   * Ouvre le formulaire d'édition de l'email, remplace la valeur, enregistre,
   * et attend le retour sur la page profil.
   */
  async editEmail(newValue: string): Promise<void> {
    const loc = getProfileLocators()
    await withWebView(async () => {
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.emailEditButton)

      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.editContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Formulaire "Contact" non chargé après clic Modifier' }
      )

      // Label "E-mail" — libellé observé dans l'APK staging (différent du code source Svelte)
      const input = await tl().findByLabelText('E-mail')
      await input.setValue(newValue)

      const submitBtn = await tl().findByRole('button', { name: 'Enregistrer' })
      await submitBtn.click()

      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Page profil non affichée après enregistrement de l\'email' }
      )
    })
  }

  /**
   * Ouvre le formulaire d'édition de l'adresse, saisit la requête BAN,
   * sélectionne le premier résultat de l'autocomplétion, enregistre,
   * et attend le retour sur la page profil.
   *
   * L'input déclenche un debounce Svelte de 750 ms avant l'appel BAN →
   * le waitUntil autocomplete attend jusqu'à 6 s.
   * L'item autocomplete est ciblé par data-testid (texte imprévisible dépendant de l'API BAN).
   */
  async editAddress(query: string): Promise<void> {
    const loc = getProfileLocators()
    await withWebView(async () => {
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.addressEditButton)

      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.editContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Formulaire "Mon adresse" non chargé après clic Modifier' }
      )

      // Label "Adresse" — setValue envoie des keystrokes qui déclenchent oninput + debounce
      const input = await tl().findByLabelText('Adresse')
      await input.setValue(query)

      // Sentinelle autocomplete : debounce 750 ms + latence API BAN
      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.autocompleteFirstItemButton) as Promise<boolean>,
        { timeout: 6000, interval: 300, timeoutMsg: 'Suggestions BAN non affichées après saisie de l\'adresse' }
      )

      // data-testid requis : texte de l'item inconnu à l'avance (retour BAN variable)
      await driver.execute((sel: string) => {
        document.querySelector<HTMLElement>(sel)?.click()
      }, loc.autocompleteFirstItemButton)

      const submitBtn = await tl().findByRole('button', { name: 'Enregistrer' })
      await submitBtn.click()

      await browser.waitUntil(
        async () => driver.execute((sel: string) =>
          !!document.querySelector(sel)
        , loc.profileContainer) as Promise<boolean>,
        { timeout: 5000, interval: 200, timeoutMsg: 'Page profil non affichée après enregistrement de l\'adresse' }
      )
    })
  }
}

export default new ProfilePage()
