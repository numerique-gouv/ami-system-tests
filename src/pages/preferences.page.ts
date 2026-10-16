import {preferencesLocators} from './locators/preferences.locators'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, pageText, setCheckbox, visibleButtonTexts, waitForHeading, waitForPageText} from '../helpers/spa'
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

    /** Coche ou décoche le consentement `key` (attribut `name` : `dinum-ami`, `dinum-dn`, `dinum-rdvsp`, `psl`) et attend l'état. */
    async setConsent(key: string, checked: boolean): Promise<void> {
        await waitForHeading(preferencesLocators.consentsTitle)
        await setCheckbox(key, checked)
    }

    /** Clique « Tout suivre » : active tous les consentements. */
    async followAll(): Promise<void> {
        await waitForHeading(preferencesLocators.consentsTitle)
        await clickButton(preferencesLocators.followAllName)
    }

    /**
     * Remet les consentements dans l'état `states` (clé = `name`/`id` de la case), en ne touchant qu'à ceux qui diffèrent. Toutes les
     * cases du snapshot sont restaurées, pas seulement les quatre de `consentKeys` : staging en a six (`Test`, `test-test` en plus) et
     * « Tout suivre » les active toutes (relevé le 2026-10-15 : un snapshot partiel laissait `Test` et `test-test` à vrai).
     */
    async restoreConsents(states: Record<string, boolean>): Promise<void> {
        const current = await this.consentStates()
        for (const [key, checked] of Object.entries(states)) {
            if (key in current && current[key] !== checked) await this.setConsent(key, checked)
        }
    }

    /** Attend le toast « Attention » affiché en retirant le consentement AMI, et vérifie qu'il annonce la conservation de l'historique. */
    async assertConsentWarningDisplayed(): Promise<void> {
        await waitForPageText(preferencesLocators.consentWarning)
        await waitForPageText(preferencesLocators.consentWarningHistory)
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
