import {aideContactLocators} from './locators/aide-contact.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {clickButton, visibleButtonTexts, waitForHeading, findRole} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de Aide et contact, Contact et des pages légales (données personnelles, accessibilité). */
class AideContactPage {
    async openHelpCenter(): Promise<void> {
        await NavigationPage.openPlusEntry('Aide et contact')
    }

    /** Entrées de la page Aide et contact (hors bouton de retour). */
    async helpEntries(): Promise<string[]> {
        await waitForHeading(aideContactLocators.helpTitle)
        return (await visibleButtonTexts()).filter(t => t !== 'Retour à la page précédente')
    }

    /** Depuis Aide et contact, « Je rencontre un problème sur l'application » ouvre Contact. */
    async openContactFromHelpCenter(): Promise<void> {
        await clickButton(aideContactLocators.helpAppProblemEntry)
    }

    /** Ouvre le dialogue « Contacter notre équipe » et retourne ses actions proposées. */
    async openContactDialog(): Promise<string[]> {
        await waitForHeading(aideContactLocators.contactTitle)
        await clickButton(aideContactLocators.contactTeamButtonName)
        await platform().inWebContext(async () => {
            await findRole('button', aideContactLocators.contactOnlineRequestName, {timeout: 5000})
        })
        const texts = await visibleButtonTexts()
        return texts.filter(t => [aideContactLocators.contactOnlineRequestName, aideContactLocators.contactMailName].includes(t))
    }

    /** Sections (boutons) d'une page légale, hors bouton de retour. `pageTitle` : titre de la page attendue. */
    async legalSections(pageTitle: string): Promise<string[]> {
        await waitForHeading(pageTitle)
        return (await visibleButtonTexts()).filter(t => t !== 'Retour à la page précédente')
    }
}

export default traced(new AideContactPage(), 'AideContactPage')
