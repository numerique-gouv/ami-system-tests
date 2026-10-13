import {onboardingPasskeyLocators} from './locators/onboarding-passkey.locators'
import {traced} from '../helpers/traced'
import {clickRole, hasRole} from '../helpers/spa'

/**
 * Page Object pour l'écran de proposition de création de clé d'accès (passkey).
 *
 * Apparaît après l'authentification FranceConnect, avant l'onboarding des notifications —
 * cf. `login-callback/+page.svelte` (app AMI). Conditionné par un feature flag applicatif :
 * peut être absent selon l'environnement/l'utilisateur, d'où le no-op silencieux de dismiss().
 */
class OnboardingPasskeyPage {
    /**
     * Sonde dédiée, réutilisée par dismiss() (même sentinelle, un seul appel).
     */
    async isVisible(timeout = 5000): Promise<boolean> {
        return await hasRole('button', onboardingPasskeyLocators.createButtonName, timeout)
    }

    /**
     * Ferme l'écran en tapant "Peut-être plus tard" (no-op si absent sous 5s — écran conditionné
     * par un feature flag applicatif, cf. classdoc). Aucune clé d'accès n'est créée.
     */
    async dismiss(): Promise<void> {
        if (!await this.isVisible()) return
        await clickRole('button', onboardingPasskeyLocators.laterButtonName)
    }
}

export default traced(new OnboardingPasskeyPage(), 'OnboardingPasskeyPage')
