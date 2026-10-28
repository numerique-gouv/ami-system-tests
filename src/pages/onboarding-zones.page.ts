import {onboardingZonesLocators} from './locators/onboarding-zones.locators'
import {traced} from '../helpers/reporting/traced'
import {checkboxStates, clickDisplayed, isShown, setCheckbox} from '../helpers/spa/spa'

/**
 * Page Object de l'écran d'onboarding « Zones scolaires » (`/#/welcome/zones`).
 *
 * Premier écran du parcours d'accueil d'une première connexion (`user_first_login=true`, cf.
 * login-callback/+page.svelte) ; il précède l'onboarding des notifications
 * (OnboardingNotificationsPage). Absent quand le compte s'est déjà connecté : tout est un no-op
 * silencieux. « Passer » ne modifie aucune préférence de zone ; une case cochée ou décochée avant est déjà enregistrée (observé en live le 2026-10-28).
 */
class OnboardingZonesPage {
    /** Sonde dédiée, réutilisée par dismiss() et par la boucle de connexion (authenticate.process.ts). */
    async isVisible(timeout = 3000): Promise<boolean> {
        return await isShown(onboardingZonesLocators.heading, timeout)
    }

    /** États des cases de zones de l'écran (clé = nom de la zone), sans les modifier. Les zones par défaut d'un compte sont cochées. */
    async zoneStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    /** Coche ou décoche la zone `name` (ex. « Zone B ») et attend l'état. Persistée sans validation : « Passer » suffit à quitter l'écran. */
    async setZone(name: string, checked: boolean): Promise<void> {
        await setCheckbox(name, checked)
    }

    /** Passe l'écran (no-op si absent sous `timeout`). L'arrivée sur la page suivante est vérifiée par elle. */
    async dismiss(timeout = 3000): Promise<void> {
        if (!await this.isVisible(timeout)) return
        await clickDisplayed(onboardingZonesLocators.skipButton, {timeout: 10000})
    }
}

export default traced(new OnboardingZonesPage(), 'OnboardingZonesPage')
