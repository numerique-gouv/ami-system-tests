import {agendaLocators} from './locators/agenda.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {clickButton, waitForHeading, findRole, findRoles, queryRole} from '../helpers/spa'
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
        return await platform().inWebContext(async () => (await findRoles('button', agendaLocators.eventDialogButtonName)).length)
    }

    /** Ouvre le dialogue du premier évènement. */
    async openFirstEvent(): Promise<void> {
        await platform().inWebContext(async () => {
            const [first] = await findRoles('button', agendaLocators.eventDialogButtonName, {timeout: 10000})
            await first.click()
        })
    }

    /** Vérifie que le dialogue d'évènement propose l'action « Supprimer » — sans l'utiliser (mutante). */
    async assertDeleteActionOffered(): Promise<void> {
        await platform().inWebContext(async () => {
            await findRole('button', agendaLocators.deleteActionName, {timeout: 5000})
        })
    }

    /** Ferme le dialogue d'évènement (bouton « Fermer la modale ») et attend sa disparition. */
    async closeEventDialog(): Promise<void> {
        await clickButton(agendaLocators.eventDialogCloseName)
        await browser.waitUntil(async () => !await this.isDeleteActionVisible(), {
            timeout: 5000, interval: 300, timeoutMsg: "Le dialogue d'évènement est resté ouvert après « Fermer la modale »",
        })
    }

    private async isDeleteActionVisible(): Promise<boolean> {
        return await platform().inWebContext(() =>
            queryRole('button', agendaLocators.deleteActionName).then(el => !!el).catch(() => false)
        )
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
