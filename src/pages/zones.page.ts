import {zonesLocators} from './locators/zones.locators'
import {traced} from '../helpers/reporting/traced'
import {checkboxStates, clickButton, setCheckbox, waitForButtons, waitForHeading} from '../helpers/spa/spa'

/** Zones scolaires (`/#/preferences/zones`), atteintes depuis l'Agenda et les Préférences ; le scénario enchaîne l'ouverture, `assertDisplayed()`, puis `back()` ou `close()`. */
class ZonesPage {
    /** Titre et bouton « Fermer » : ce bouton la distingue de l'onboarding `/welcome/zones`, qui propose « Passer ». */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(zonesLocators.pageTitle)
        await waitForButtons([zonesLocators.closeButtonName])
    }

    /** États des cases de zones, par nom de zone. */
    async zoneStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    /** Coche ou décoche la zone `name` (ex. « Zone B »). */
    async setZone(name: string, checked: boolean): Promise<void> {
        await this.assertDisplayed()
        await setCheckbox(name, checked)
    }

    /** Remet les zones dans l'état `states`, en ne touchant qu'à celles qui diffèrent. */
    async restoreZones(states: Record<string, boolean>): Promise<void> {
        const current = await this.zoneStates()
        for (const [name, checked] of Object.entries(states)) {
            if (name in current && current[name] !== checked) await setCheckbox(name, checked)
        }
    }

    /** Revient à la page d'origine (Agenda ou Préférences). */
    async back(): Promise<void> {
        await clickButton(zonesLocators.backButtonName)
    }

    /** Revient aux Préférences (depuis l'Agenda : non confirmé). */
    async close(): Promise<void> {
        await clickButton(zonesLocators.closeButtonName)
    }
}

export default traced(new ZonesPage(), 'ZonesPage')
