import {traced} from '../helpers/reporting/traced'
import {profileLocators} from './locators/profile.locators'
import {clickDisplayed, firstDisplayed, isShown, waitForHeading} from '../helpers/spa/spa'
import NavigationPage from './navigation.page'

class ProfilePage {
    /** Rejoint la sous-page « Mon identité » ou « Mes coordonnées » : par le menu du hub, après avoir rejoint le hub si on n'y est pas. */
    private async openSection(section: 'identity' | 'contact'): Promise<void> {
        const marker = section === 'identity' ? profileLocators.identitySection : profileLocators.emailSection
        const menuButton = section === 'identity' ? profileLocators.identityMenuButton : profileLocators.contactMenuButton
        if (await isShown(marker)) return
        if (!await isShown(profileLocators.hubHeading)) await this.navigateToProfileDirect()
        await clickDisplayed(menuButton, {timeout: 5000})
        await firstDisplayed(marker, {timeout: 5000})
    }

    /** Le profil est affiché : le hub « Mon profil » ou une de ses sous-pages (Enregistrer ou Annuler fait un retour arrière vers la sous-page d'origine, ou le hub). */
    async assertDisplayed(): Promise<void> {
        await browser.waitUntil(
            async () => await isShown(profileLocators.hubHeading) || await isShown(profileLocators.identitySection) || await isShown(profileLocators.emailSection),
            {timeout: 5000, interval: 250, timeoutMsg: "Ni le hub « Mon profil » ni une sous-page du profil affichés après la sortie du formulaire d'édition"}
        )
    }

    async assertAddressFormDisplayed(): Promise<void> {
        await firstDisplayed(profileLocators.addressFormHeading)
    }

    /** Menu avatar → « Mon profil ». À appeler dans un `inWebContext`. */
    async navigate(): Promise<void> {
        await NavigationPage.openPlusMenu()
        await clickDisplayed(profileLocators.profileMenuButton, {timeout: 5000})
        await waitForHeading(profileLocators.pageTitle)
    }

    private async boldTexts(section: string): Promise<string[]> {
        const texts: string[] = []
        for await (const b of $$(profileLocators.boldIn(section))) {
            const text = (await b.getText()).trim()
            if (text) texts.push(text)
        }
        return texts
    }

    /** Ordre : [nom usuel, nom de naissance, date naissance, lieu naissance]. */
    async getIdentityBolds(): Promise<string[]> {
        await this.openSection('identity')
        return await this.boldTexts(profileLocators.identitySection)
    }

    /** Valeur du champ « Nom d'usage » du formulaire d'édition, quitté par « Annuler » : la sous-page « Mon identité » affiche le nom FranceConnect et ne reflète pas la modification. */
    async getPreferredUsernameField(): Promise<string> {
        await this.openSection('identity')
        await clickDisplayed(profileLocators.preferredUsernameEditButton, {timeout: 5000})
        const input = await firstDisplayed(profileLocators.preferredUsernameInput, {timeout: 5000})
        const value = await input.getValue()
        await clickDisplayed(profileLocators.cancelButton, {timeout: 5000})
        await this.assertDisplayed()
        return value
    }

    async getEmailBold(): Promise<string> {
        await this.openSection('contact')
        return (await $(profileLocators.boldIn(profileLocators.emailSection)).getText()).trim()
    }

    /** Ordre : [rue, code postal + ville] ; tableau vide si l'usager n'a pas d'adresse connue, ce qui est légitime. */
    async getAddressBolds(): Promise<string[]> {
        await this.openSection('contact')
        // Le rendu de la carte peut être en cours : on attend deux lectures identiques du HTML plutôt que des balises <b> (une adresse peut être vide).
        let previousHtml: string | null = null
        await browser.waitUntil(
            async () => {
                const html = await $(profileLocators.addressSection).getHTML({includeSelectorTag: false}).catch(() => null)
                const stable = html !== null && html === previousHtml
                previousHtml = html
                return stable
            },
            {timeout: 5000, interval: 300, timeoutMsg: 'Section "Mon adresse" jamais stabilisée'}
        )
        return await this.boldTexts(profileLocators.addressSection)
    }

    /** Navigation par le hash : aucun bouton ne mène au profil depuis un formulaire d'édition. */
    private async navigateToProfileDirect(): Promise<void> {
        await driver.execute(() => {
            window.location.hash = '/profile'
        })
        await waitForHeading(profileLocators.pageTitle, 5000)
    }

    private async editField(section: 'identity' | 'contact', editButton: string, inputSelector: string, newValue: string): Promise<void> {
        await this.openSection(section)
        await clickDisplayed(editButton)
        const input = await firstDisplayed(inputSelector, {timeout: 5000})
        await input.setValue(newValue)
        await clickDisplayed(profileLocators.saveButton)
        await this.assertDisplayed()
    }

    async editPreferredUsername(newValue: string): Promise<void> {
        await this.editField('identity', profileLocators.preferredUsernameEditButton, profileLocators.preferredUsernameInput, newValue)
    }

    async editEmail(newValue: string): Promise<void> {
        await this.editField('contact', profileLocators.emailEditButton, profileLocators.emailInput, newValue)
    }

    /** Menu avatar → « Me déconnecter » → confirmation. Le signal de fin est la disparition de la modale, identique sur les deux plateformes. */
    async logout(): Promise<void> {
        await NavigationPage.openPlusMenu()
        await clickDisplayed(profileLocators.logoutButton)
        await firstDisplayed(profileLocators.deletionHeading, {timeout: 5000})
        await clickDisplayed(profileLocators.confirmButton)
        // `$()` et non l'élément cliqué : la déconnexion remplace le document, un élément déjà résolu y deviendrait périmé.
        await $(profileLocators.confirmButton).waitForDisplayed({timeout: 15000, reverse: true})
    }

    /** Remet le profil dans son état d'origine (hook `after`). Chaque étape est indépendante : un échec partiel ne bloque pas les autres. `email` absent : non modifié. */
    async restore(original: {preferredUsername: string; email?: string}): Promise<void> {
        const attempt = async (action: () => Promise<void>): Promise<void> => {
            try { await action() } catch { /* étape indépendante */ }
        }
        await attempt(() => this.navigateToProfileDirect())
        await attempt(() => this.editPreferredUsername(original.preferredUsername))
        if (original.email !== undefined) await attempt(() => this.editEmail(original.email as string))
    }

    /** Le debounce Svelte de 750 ms précède l'appel BAN : l'item d'autocomplétion est attendu jusqu'à 6 s. */
    async editAddress(query: string): Promise<void> {
        await this.openSection('contact')
        const editBtn = await firstDisplayed(profileLocators.addressEditButton)
        // Vérifie aussi qu'aucun élément (info-tip) ne recouvre le bouton au point de clic.
        await editBtn.waitForClickable({timeout: 5000})
        await editBtn.click()
        const input = await firstDisplayed(profileLocators.addressInput, {timeout: 5000})
        await input.setValue(query)
        await clickDisplayed(profileLocators.autocompleteFirstItem, {timeout: 6000})
        await clickDisplayed(profileLocators.saveButton)
        await this.assertDisplayed()
    }
}

export default traced(new ProfilePage(), 'ProfilePage')
