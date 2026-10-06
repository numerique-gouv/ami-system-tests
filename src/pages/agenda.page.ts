import {agendaLocators} from './locators/agenda.locators'
import {platform} from '../platform'
import {tl} from '../helpers/webview'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, clickButtonInDialog, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de l'Agenda (`/#/agenda`) : liste des évènements et sélecteur de zones scolaires. */
class AgendaPage {
    async open(): Promise<void> {
        await NavigationPage.goToTab('Agenda')
    }

    async assertSectionsVisible(): Promise<void> {
        await waitForHeading(agendaLocators.upcomingHeading)
        await waitForHeading(agendaLocators.laterMonthsHeading)
    }

    /** Nombre d'évènements listés (un bouton d'ouverture de dialogue par évènement). */
    async countEvents(): Promise<number> {
        return await platform().inWebContext(async () => (await tl().findAllByRole('button', {name: agendaLocators.eventDialogButtonName})).length)
    }

    /** Ouvre le dialogue du premier évènement. */
    async openFirstEvent(): Promise<void> {
        await platform().inWebContext(async () => {
            const [first] = await tl().findAllByRole('button', {name: agendaLocators.eventDialogButtonName}, {timeout: 10000})
            await first.click()
        })
    }

    /** Vérifie que le dialogue d'évènement propose l'action « Supprimer » — sans l'utiliser (mutante). */
    async assertDeleteActionOffered(): Promise<void> {
        await platform().inWebContext(async () => {
            await tl().findByRole('button', {name: agendaLocators.deleteActionName}, {timeout: 5000})
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
            tl().queryByRole('button', {name: agendaLocators.deleteActionName}).then(el => !!el).catch(() => false)
        )
    }

    /** Ouvre le sélecteur de zones scolaires via le bouton « Préférences » de l'agenda. */
    async openZonePreferences(): Promise<void> {
        await clickButton(agendaLocators.preferencesButtonName)
        await waitForHeading(agendaLocators.zonesHeading)
    }

    /** États des cases de zones (clé = nom de la zone). Sans les modifier. */
    async zoneStates(): Promise<Record<string, boolean>> {
        return await checkboxStates()
    }

    async closeZonePreferences(): Promise<void> {
        await clickButtonInDialog(agendaLocators.zonesHeading, agendaLocators.zonesCloseButtonName)
    }
}

export default traced(new AgendaPage(), 'AgendaPage')
