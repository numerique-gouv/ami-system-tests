import {onboardingZonesLocators} from './locators/onboarding-zones.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {findRole} from '../helpers/spa'

/**
 * Page Object de l'écran d'onboarding « Zones scolaires » (`/#/welcome/zones`).
 *
 * Premier écran du parcours d'accueil d'une première connexion (`user_first_login=true`, cf.
 * login-callback/+page.svelte) ; il précède l'onboarding des notifications
 * (OnboardingNotificationsPage). Absent quand le compte s'est déjà connecté : tout est un no-op
 * silencieux. « Passer » ne modifie aucune préférence de zone.
 */
class OnboardingZonesPage {
    private async isOnZonesRoute(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() =>
            driver.execute(() => /#\/welcome\/zones/.test(location.hash)) as Promise<boolean>
        ).catch(() => false)
    }

    /** Sonde dédiée, réutilisée par dismiss() et HomePage.assertHomeVisible(). */
    async isVisible(timeout = 3000): Promise<boolean> {
        return await browser.waitUntil(() => this.isOnZonesRoute(), {timeout, interval: 300})
            .then(() => true)
            .catch(() => false)
    }

    /** Passe l'écran (no-op si absent sous `timeout`) et attend d'en être sorti. */
    async dismiss(timeout = 3000): Promise<void> {
        if (!await this.isVisible(timeout)) return
        await platform().inWebContext(async () => {
            const skip = await findRole('button', onboardingZonesLocators.skipButtonName, {timeout: 10000})
            await skip.click()
        })
        await browser.waitUntil(async () => !await this.isOnZonesRoute(), {
            timeout: 10000, interval: 300, timeoutMsg: 'Écran « Zones scolaires » toujours affiché après « Passer »',
        })
    }
}

export default traced(new OnboardingZonesPage(), 'OnboardingZonesPage')
