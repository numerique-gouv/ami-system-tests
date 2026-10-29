import {onboardingPasskeyLocators} from './locators/onboarding-passkey.locators'
import {traced} from '../helpers/reporting/traced'
import {clickDisplayed, isShown} from '../helpers/spa/spa'

/** Proposition de clé d'accès après FranceConnect, conditionnée par un feature flag : absente selon l'environnement. */
class OnboardingPasskeyPage {
    async isVisible(timeout = 5000): Promise<boolean> {
        return await isShown(onboardingPasskeyLocators.createButton, timeout)
    }

    /** « Peut-être plus tard » : aucune clé d'accès n'est créée ; sans effet si l'écran est absent. */
    async dismiss(): Promise<void> {
        if (!await this.isVisible()) return
        await clickDisplayed(onboardingPasskeyLocators.laterButton)
    }
}

export default traced(new OnboardingPasskeyPage(), 'OnboardingPasskeyPage')
