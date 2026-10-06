import {preferencesLocators} from './locators/preferences.locators'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, pageText, visibleButtonTexts, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de Préférences : suivi des démarches (consentements), notifications, zones scolaires. */
class PreferencesPage {
    async open(): Promise<void> {
        await NavigationPage.openPlusEntry('Préférences')
    }

    async entries(): Promise<string[]> {
        const texts = await visibleButtonTexts()
        return texts.filter(t => preferencesLocators.entries.includes(t))
    }

    async openConsents(): Promise<void> {
        await clickButton(preferencesLocators.entries[0])
        await NavigationPage.waitForHash(/#\/preferences\/consents$/)
        await waitForHeading(preferencesLocators.consentsTitle)
    }

    async openNotifications(): Promise<void> {
        await clickButton(preferencesLocators.entries[1])
        await NavigationPage.waitForHash(/#\/preferences\/notifications$/)
        await waitForHeading(preferencesLocators.notificationsTitle)
    }

    /** États des cases de consentement par identifiant de partenaire (`name`), sans les modifier. */
    async consentStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    /** Libellés « Suivre mes démarches {partenaire} sur mon appareil mobile » affichés. */
    async consentLabels(): Promise<string[]> {
        const text = await pageText()
        return Array.from(text.matchAll(/Suivre mes démarches (.+?) sur mon appareil mobile/g)).map(m => m[1])
    }

    async notificationToggleState(): Promise<boolean | undefined> {
        return (await checkboxStates())[preferencesLocators.notificationToggleName]
    }
}

export default traced(new PreferencesPage(), 'PreferencesPage')
