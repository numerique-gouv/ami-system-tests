import {onboardingPasskeyLocators} from './locators/onboarding-passkey.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {findRole} from '../helpers/spa'

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
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() =>
            browser.waitUntil(
                () => driver.execute(
                    (pattern: string) => Array.from(document.querySelectorAll('button'))
                        .some(b => new RegExp(pattern, 'i').test(b.textContent ?? '')),
                    onboardingPasskeyLocators.createButtonName.source
                ) as Promise<boolean>,
                {timeout, interval: 300}
            ).then(() => true)
        ).catch(() => false)
    }

    /**
     * Ferme l'écran en tapant "Peut-être plus tard" (no-op si absent sous 5s — écran conditionné
     * par un feature flag applicatif, cf. classdoc). Aucune clé d'accès n'est créée.
     */
    async dismiss(): Promise<void> {
        if (!await this.isVisible()) return
        await platform().inWebContext(async () => {
            const later = await findRole('button', onboardingPasskeyLocators.laterButtonName)
            await later.click()
        })
    }
}

export default traced(new OnboardingPasskeyPage(), 'OnboardingPasskeyPage')