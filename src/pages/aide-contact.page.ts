import {aideContactLocators} from './locators/aide-contact.locators'
import {traced} from '../helpers/reporting/traced'
import {clickButton, visibleButtonTexts, waitForHeading, waitForRole} from '../helpers/spa/spa'
import {followAndDescribe, type LinkTarget} from '../helpers/webapp/link-check'
import NavigationPage from './navigation.page'

/** Aide et contact, Contact et pages légales (données personnelles, accessibilité). */
class AideContactPage {
    /** Aide et contact par défaut ; `title` désigne une autre vue (Nous contacter, pages légales). */
    async assertDisplayed(title = aideContactLocators.helpTitle): Promise<void> {
        await waitForHeading(title)
    }

    async openHelpCenter(): Promise<void> {
        await NavigationPage.openPlusEntry('Aide et contact')
    }

    /** Entrées de Aide et contact, hors bouton de retour. */
    async helpEntries(): Promise<string[]> {
        await this.assertDisplayed()
        return (await visibleButtonTexts()).filter(t => t !== 'Retour à la page précédente')
    }

    /** Clique « J’ai besoin de l’aide de l’administration » (lien externe) et décrit la page atteinte. */
    async openAdministrationHelp(): Promise<LinkTarget> {
        await this.assertDisplayed()
        return await followAndDescribe(async () => {
            await clickButton(aideContactLocators.helpAdministrationEntry)
        })
    }

    /** Revient sur Aide et contact après un lien externe. */
    async returnFromExternal(): Promise<void> {
        await browser.url('/#/help-center')
        await this.assertDisplayed()
    }

    /** Depuis Aide et contact, « Je rencontre un problème sur l'application » ouvre Contact. */
    async openContactFromHelpCenter(): Promise<void> {
        await clickButton(aideContactLocators.helpAppProblemEntry)
    }

    /** Ouvre le dialogue « Contacter notre équipe » et retourne ses actions proposées. */
    async openContactDialog(): Promise<string[]> {
        await this.assertDisplayed(aideContactLocators.contactTitle)
        await clickButton(aideContactLocators.contactTeamButtonName)
        await waitForRole('button', aideContactLocators.contactOnlineRequestName, {timeout: 5000})
        const texts = await visibleButtonTexts()
        return texts.filter(t => [aideContactLocators.contactOnlineRequestName, aideContactLocators.contactMailName].includes(t))
    }

    /** Sections d'une page légale, hors bouton de retour. */
    async legalSections(pageTitle: string): Promise<string[]> {
        await this.assertDisplayed(pageTitle)
        return (await visibleButtonTexts()).filter(t => t !== 'Retour à la page précédente')
    }
}

export default traced(new AideContactPage(), 'AideContactPage')
