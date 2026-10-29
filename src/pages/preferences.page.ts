import {preferencesLocators} from './locators/preferences.locators'
import {traced} from '../helpers/reporting/traced'
import {checkboxStates, clickButton, pageText, setCheckbox, visibleButtonTexts, waitForHeading, waitForPageText} from '../helpers/spa/spa'
import NavigationPage from './navigation.page'
import type {PartnerId} from '../helpers/partner-api'

/**
 * Préférences : les cases « Suivi des démarches » sont les consentements aux démarches, un par partenaire ; le réglage « Notifications »
 * est l'interrupteur push GLOBAL à AMI, sans endpoint, qui dépend de la permission du système.
 */
class PreferencesPage {
    async open(): Promise<void> {
        await NavigationPage.openPlusEntry('Préférences')
    }

    async assertDisplayed(): Promise<void> {
        await waitForHeading(preferencesLocators.pageTitle)
    }

    async entries(): Promise<string[]> {
        await this.assertDisplayed()
        const texts = await visibleButtonTexts()
        return texts.filter(t => preferencesLocators.entries.includes(t))
    }

    async openDemarchesConsents(): Promise<void> {
        await clickButton(preferencesLocators.entries[0])
    }

    async openPushNotificationsSettings(): Promise<void> {
        await clickButton(preferencesLocators.entries[1])
    }

    async openZones(): Promise<void> {
        await clickButton(preferencesLocators.entries[2])
    }

    async demarchesConsentStates(): Promise<Record<string, boolean>> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        return await checkboxStates()
    }

    async setDemarchesConsent(partner: PartnerId, checked: boolean): Promise<void> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        await setCheckbox(partner, checked)
    }

    async followAllDemarches(): Promise<void> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        await clickButton(preferencesLocators.followAllDemarchesName)
    }

    /** Remet les cases dans l'état `states` (clé = `name`/`id`) en ne touchant qu'à celles qui diffèrent : toutes celles du snapshot, car « Tout suivre » les active toutes. */
    async restoreDemarchesConsents(states: Record<string, boolean>): Promise<void> {
        const current = await this.demarchesConsentStates()
        for (const [key, checked] of Object.entries(states)) {
            if (key in current && current[key] !== checked) await this.setDemarchesConsent(key, checked)
        }
    }

    /** Toast « Attention » affiché en retirant le consentement AMI : il annonce la conservation de l'historique. */
    async assertDemarchesConsentWarningDisplayed(): Promise<void> {
        await waitForPageText(preferencesLocators.demarchesConsentWarning)
        await waitForPageText(preferencesLocators.demarchesConsentWarningHistory)
    }

    async demarchesConsentLabels(): Promise<string[]> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        const text = await pageText()
        return Array.from(text.matchAll(/Suivre mes démarches (.+?) sur mon appareil mobile/g)).map(m => m[1])
    }

    /** État de l'interrupteur global des notifications push (Préférences > Notifications). */
    async pushNotificationsToggleState(): Promise<boolean | undefined> {
        await waitForHeading(preferencesLocators.notificationsTitle)
        return (await checkboxStates())[preferencesLocators.pushNotificationsToggleName]
    }
}

export default traced(new PreferencesPage(), 'PreferencesPage')
