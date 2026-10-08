import {preferencesLocators} from './locators/preferences.locators'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, pageText, visibleButtonTexts, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de Préférences : suivi des démarches (consentements), notifications, zones scolaires. */
class PreferencesPage {
    async open(): Promise<void> {
        await NavigationPage.openPlusEntry('Préférences')
    }

    /** Vérifie l'arrivée sur la page Préférences (titre). */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(preferencesLocators.pageTitle)
    }

    async entries(): Promise<string[]> {
        await this.assertDisplayed()
        const texts = await visibleButtonTexts()
        return texts.filter(t => preferencesLocators.entries.includes(t))
    }

    async openConsents(): Promise<void> {
        await clickButton(preferencesLocators.entries[0])
    }

    async openNotifications(): Promise<void> {
        await clickButton(preferencesLocators.entries[1])
    }

    /** Clique l'entrée « Zones scolaires », qui ouvre la page `/#/preferences/zones` (vérifiée par `ZonesPage.assertDisplayed()`). */
    async openZones(): Promise<void> {
        await clickButton(preferencesLocators.entries[2])
    }

    /** Vérifie l'arrivée sur la page des préférences de notifications (titre). */
    async assertNotificationsDisplayed(): Promise<void> {
        await waitForHeading(preferencesLocators.notificationsTitle)
    }

    /** États des cases de consentement par identifiant de partenaire (`name`), sans les modifier. */
    async consentStates(): Promise<Record<string, boolean>> {
        await waitForHeading(preferencesLocators.consentsTitle)
        return await checkboxStates()
    }

    /** Libellés « Suivre mes démarches {partenaire} sur mon appareil mobile » affichés. */
    async consentLabels(): Promise<string[]> {
        await waitForHeading(preferencesLocators.consentsTitle)
        const text = await pageText()
        return Array.from(text.matchAll(/Suivre mes démarches (.+?) sur mon appareil mobile/g)).map(m => m[1])
    }

    async notificationToggleState(): Promise<boolean | undefined> {
        await this.assertNotificationsDisplayed()
        return (await checkboxStates())[preferencesLocators.notificationToggleName]
    }
}

export default traced(new PreferencesPage(), 'PreferencesPage')
