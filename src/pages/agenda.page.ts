import {agendaLocators} from './locators/agenda.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {allDisplayed, clickButton, clickDisplayed, firstDisplayed, isShown, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de l'Agenda (`/#/agenda`) : liste des évènements et accès aux zones scolaires (page `ZonesPage`). */
class AgendaPage {
    async open(): Promise<void> {
        await NavigationPage.goToTab('Agenda')
    }

    /** Vérifie l'arrivée sur la page Agenda (titre). */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(agendaLocators.pageTitle)
    }

    async assertSectionsVisible(): Promise<void> {
        await waitForHeading(agendaLocators.upcomingHeading)
        await waitForHeading(agendaLocators.laterMonthsHeading)
    }

    /** Nombre d'évènements listés (un bouton d'ouverture de dialogue par évènement). */
    async countEvents(): Promise<number> {
        return await platform().inWebContext(async () => {
            await firstDisplayed(agendaLocators.eventDialogButton, {timeout: 10000})
            return (await allDisplayed(agendaLocators.eventDialogButton)).length
        })
    }

    /** Ouvre le dialogue du premier évènement. */
    async openFirstEvent(): Promise<void> {
        await clickDisplayed(agendaLocators.eventDialogButton, {timeout: 10000})
    }

    /** Vérifie que le dialogue d'évènement propose l'action « Supprimer » — sans l'utiliser (mutante). */
    async assertDeleteActionOffered(): Promise<void> {
        await platform().inWebContext(async () => {
            await firstDisplayed(agendaLocators.deleteAction, {timeout: 5000})
        })
    }

    /** Ferme le dialogue d'évènement (bouton « Fermer la modale ») et attend sa disparition. */
    async closeEventDialog(): Promise<void> {
        await clickButton(agendaLocators.eventDialogCloseName)
        await browser.waitUntil(async () => !await isShown(agendaLocators.deleteAction), {
            timeout: 5000, interval: 300, timeoutMsg: "Le dialogue d'évènement est resté ouvert après « Fermer la modale »",
        })
    }

    /**
     * Clique le bouton « Préférences » de l'agenda, qui ouvre la page des zones scolaires (`/#/preferences/zones`, plus un dialogue
     * depuis le 2026-10-08). L'arrivée est vérifiée par `ZonesPage.assertDisplayed()`, pas ici.
     */
    async openZonePreferences(): Promise<void> {
        await clickButton(agendaLocators.preferencesButtonName)
    }
}

export default traced(new AgendaPage(), 'AgendaPage')
