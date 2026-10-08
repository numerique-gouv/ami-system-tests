import {zonesLocators} from './locators/zones.locators'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, waitForButtons, waitForHeading} from '../helpers/spa'

/**
 * Page Object de la page des zones scolaires (`/#/preferences/zones`), atteinte depuis l'Agenda et depuis les Préférences.
 * Elle ne connaît pas ses pages d'origine : c'est le scénario qui enchaîne `AgendaPage.openZonePreferences()` (ou
 * `PreferencesPage.openZones()`), `ZonesPage.assertDisplayed()`, puis `back()` ou `close()` et la page d'origine.
 */
class ZonesPage {
    /**
     * Vérifie l'arrivée sur la page (titre + bouton « Fermer »). Le bouton distingue cette page de l'onboarding
     * `/welcome/zones`, qui porte le même titre mais propose « Passer ».
     */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(zonesLocators.pageTitle)
        await waitForButtons([zonesLocators.closeButtonName])
    }

    /** États des cases de zones (clé = nom de la zone). Sans les modifier. */
    async zoneStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    /** « Retour à la page précédente » : revient à la page d'origine (Agenda ou Préférences). */
    async back(): Promise<void> {
        await clickButton(zonesLocators.backButtonName)
    }

    /** « Fermer » : revient aux Préférences (vérifié depuis les Préférences ; depuis l'Agenda : non confirmé). */
    async close(): Promise<void> {
        await clickButton(zonesLocators.closeButtonName)
    }
}

export default traced(new ZonesPage(), 'ZonesPage')
