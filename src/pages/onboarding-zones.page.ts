import {onboardingZonesLocators} from './locators/onboarding-zones.locators'
import {traced} from '../helpers/reporting/traced'
import {checkboxStates, clickDisplayed, isShown, setCheckbox} from '../helpers/spa/spa'

/** Onboarding « Zones scolaires » (`/#/welcome/zones`), premier écran d'une première connexion ; absent sinon. « Passer » ne modifie aucune zone. */
class OnboardingZonesPage {
    async isVisible(timeout = 3000): Promise<boolean> {
        return await isShown(onboardingZonesLocators.heading, timeout)
    }

    /** États des cases de zones, par nom de zone. */
    async zoneStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    /** Coche ou décoche la zone `name` (ex. « Zone B »), enregistrée sans validation. */
    async setZone(name: string, checked: boolean): Promise<void> {
        await setCheckbox(name, checked)
    }

    /** Passe l'écran, sans effet s'il est absent sous `timeout`. */
    async dismiss(timeout = 3000): Promise<void> {
        if (!await this.isVisible(timeout)) return
        await clickDisplayed(onboardingZonesLocators.skipButton, {timeout: 10000})
    }
}

export default traced(new OnboardingZonesPage(), 'OnboardingZonesPage')
