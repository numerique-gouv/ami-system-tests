import {agendaLocators} from './locators/agenda.locators'
import {traced} from '../helpers/reporting/traced'
import {allDisplayed, clickButton, clickDisplayed, firstDisplayed, isShown, waitForHeading} from '../helpers/spa/spa'
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
        await firstDisplayed(agendaLocators.eventDialogButton, {timeout: 10000})
        return (await allDisplayed(agendaLocators.eventDialogButton)).length
    }

    /** Ouvre le dialogue du premier évènement. */
    async openFirstEvent(): Promise<void> {
        await clickDisplayed(agendaLocators.eventDialogButton, {timeout: 10000})
    }

    /** Titres affichés des éléments de l'agenda, dans l'ordre de la page (espaces normalisés, emoji final compris). */
    async eventTitles(): Promise<string[]> {
        await firstDisplayed(agendaLocators.eventTitles, {timeout: 10000})
        const texts: string[] = []
        for (const title of await allDisplayed(agendaLocators.eventTitles)) texts.push((await title.getText()).replace(/\s+/g, ' ').trim())
        return texts
    }

    /** Sonde : un élément dont le titre commence par `title` est-il listé (attend jusqu'à `timeout` ms, 0 : maintenant) ? */
    async isEventListed(title: string, timeout = 0): Promise<boolean> {
        return await isShown(agendaLocators.eventItem(title), timeout)
    }

    /** Attend l'élément et retourne tout son texte visible (titre, catégorie, dates, zones…), espaces normalisés. */
    async eventText(title: string): Promise<string> {
        const item = await firstDisplayed(agendaLocators.eventItem(title), {timeout: 10000})
        return (await item.getText()).replace(/\s+/g, ' ').trim()
    }

    /** Ouvre la modale de l'élément dont le titre commence par `title` (bouton d'ouverture du même conteneur). */
    async openEventDialog(title: string): Promise<void> {
        const item = await firstDisplayed(agendaLocators.eventItem(title), {timeout: 10000})
        await item.$(agendaLocators.eventOpenInItem).click()
    }

    /** Clique le TITRE de l'élément : pour une démarche avec échéance, ouvre son détail (**non confirmé**, vérifié par `DemarcheDetailPage`). */
    async openEventTitle(title: string): Promise<void> {
        const item = await firstDisplayed(agendaLocators.eventItem(title), {timeout: 10000})
        await item.$(agendaLocators.eventTitleInItem).click()
    }

    /** Supprime l'élément (modale › bouton « Masquer », ex-« Supprimer » avant le front #1430 du 2026-10-26) et attend sa disparition de la liste. */
    async deleteEvent(title: string): Promise<void> {
        await this.openEventDialog(title)
        await clickDisplayed(agendaLocators.deleteAction, {timeout: 5000})
        await browser.waitUntil(async () => !await this.isEventListed(title), {
            timeout: 10000, interval: 300, timeoutMsg: `L'élément « ${title} » est toujours dans l'agenda 10000ms après « Masquer »`,
        })
    }

    /** Vérifie que le dialogue d'évènement propose l'action « Masquer » (ex-« Supprimer ») — sans l'utiliser (mutante). */
    async assertDeleteActionOffered(): Promise<void> {
        await firstDisplayed(agendaLocators.deleteAction, {timeout: 5000})
    }

    /** Ferme le dialogue d'évènement (bouton « Fermer ») et attend sa disparition. */
    async closeEventDialog(): Promise<void> {
        await clickButton(agendaLocators.eventDialogCloseName)
        await browser.waitUntil(async () => !await isShown(agendaLocators.deleteAction), {
            timeout: 5000, interval: 300, timeoutMsg: "Le dialogue d'évènement est resté ouvert après « Fermer »",
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
