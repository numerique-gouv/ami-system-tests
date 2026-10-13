import {onboardingZonesLocators} from './locators/onboarding-zones.locators'
import {traced} from '../helpers/traced'
import {clickRole, hasRole} from '../helpers/spa'

/**
 * Page Object de l'écran d'onboarding « Zones scolaires » (`/#/welcome/zones`).
 *
 * Premier écran du parcours d'accueil d'une première connexion (`user_first_login=true`, cf.
 * login-callback/+page.svelte) ; il précède l'onboarding des notifications
 * (OnboardingNotificationsPage). Absent quand le compte s'est déjà connecté : tout est un no-op
 * silencieux. « Passer » ne modifie aucune préférence de zone.
 */
class OnboardingZonesPage {
    /** Sonde dédiée, réutilisée par dismiss() et par la boucle de connexion (authenticate.process.ts). */
    async isVisible(timeout = 3000): Promise<boolean> {
        return await hasRole('heading', onboardingZonesLocators.headingName, timeout)
    }

    /** Passe l'écran (no-op si absent sous `timeout`). L'arrivée sur la page suivante est vérifiée par elle. */
    async dismiss(timeout = 3000): Promise<void> {
        if (!await this.isVisible(timeout)) return
        await clickRole('button', onboardingZonesLocators.skipButtonName, {timeout: 10000})
    }
}

export default traced(new OnboardingZonesPage(), 'OnboardingZonesPage')
