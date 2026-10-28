import {navigationLocators} from './locators/navigation.locators'
import type {PlusEntry, TabName} from './locators/navigation.locators'
import {traced} from '../helpers/reporting/traced'
import {clickDisplayed, firstDisplayed} from '../helpers/spa/spa'

/**
 * Navigation principale de la SPA : barre basse (Accueil, Agenda, Services, Suivi), menu « Plus »
 * et navigation directe par hash. Partagée par toutes les pages « onglet » — les Page Objects
 * métier (Agenda, Services…) ne portent que leurs propres actions.
 */
class NavigationPage {
    /** Navigue directement vers une route (ex. `/network-error`) sans recharger la SPA. */
    async goToRoute(route: string): Promise<void> {
        // driver.execute : aucun bouton ne mène à ces routes (ex. /network-error) — navigation directe par hash.
        await driver.execute((r: string) => { window.location.hash = r }, route)
    }

    /**
     * Clique un onglet de la barre basse. La page d'origine ne connaît pas la suivante : l'arrivée est
     * vérifiée par la page cible (ses propres méthodes, ex. `AgendaPage.assertDisplayed()`).
     */
    async goToTab(tab: TabName): Promise<void> {
        await this.closePlusMenu()
        await clickDisplayed(navigationLocators.tab(tab), {timeout: 10000, within: navigationLocators.bottomBar})
    }

    /** Le dialogue du menu « Plus » est-il ouvert ? */
    async isPlusMenuOpen(): Promise<boolean> {
        return (await $$(navigationLocators.plusDialogOpened)).length > 0
    }

    /**
     * Ouvre le menu « Plus » (dialogue). Idempotent : sans effet s'il est déjà ouvert.
     *
     * Le clic sur « Plus » est REJOUÉ tant que le dialogue n'est pas ouvert : constaté en live le 2026-10-26 (staging, front avec
     * `LightModal`/`BottomModal`), un clic donné juste après un changement de page est perdu (le dialogue n'a pas encore été
     * initialisé par le DSFR, qui lui pose `data-fr-js-modal`) : le bouton « Plus » est affiché et cliquable, mais rien ne s'ouvre.
     * Un second clic ~0,5 s plus tard ouvre le menu (8 essais sur 8). Le clic ne bascule pas : le rejouer sur un menu déjà ouvert est sans effet.
     */
    async openPlusMenu(): Promise<void> {
        // Ouvert ET affiché : la classe `fr-modal--opened` peut être posée sur un dialogue que la SPA remplace aussitôt (nouvelle page).
        const isReady = async (): Promise<boolean> => await this.isPlusMenuOpen() && await $(navigationLocators.plusDialog).isDisplayed()
        await browser.waitUntil(async () => {
            if (await isReady()) return true
            await clickDisplayed(navigationLocators.tab('Plus'), {timeout: 10000, within: navigationLocators.bottomBar})
            try {
                await browser.waitUntil(isReady, {timeout: 1500, interval: 250})
                return true
            } catch {
                return false
            }
        }, {timeout: 15000, interval: 100, timeoutMsg: 'Le menu « Plus » ne s’ouvre pas après plusieurs clics sur le bouton « Plus » (15000ms)'})
    }

    /**
     * Ferme le menu « Plus » s'il est ouvert (sans effet sinon, sans attente). Observé en webapp (Chrome desktop) juste
     * après le login : ce dialogue DSFR reste ouvert sans qu'aucun clic ne l'ait ouvert et recouvre l'écran, ce qui
     * intercepte le clic suivant ("element click intercepted"). Non reproduit sur WebView Android/iOS — cause côté app
     * non élucidée, contournement test uniquement. Pas d'avertissement : un scénario peut l'avoir ouvert lui-même
     * (`listPlusEntries()`). Le menu est aussi le menu profil/avatar.
     */
    async closePlusMenu(): Promise<void> {
        const close = $(navigationLocators.plusDialogClose)
        if (await close.isExisting()) await close.click()
    }

    /** Ouvre le menu « Plus » et clique une entrée. L'arrivée est vérifiée par la page cible. */
    async openPlusEntry(entry: PlusEntry): Promise<void> {
        await this.openPlusMenu()
        await clickDisplayed(navigationLocators.plusEntry(entry), {timeout: 10000, within: navigationLocators.plusDialog})
    }

    /** Liste les entrées du menu « Plus » (menu ouvert par la méthode), hors bouton « Fermer » (sans texte visible). */
    async listPlusEntries(): Promise<string[]> {
        await this.openPlusMenu()
        await firstDisplayed(navigationLocators.anyButton, {timeout: 10000, within: navigationLocators.plusDialog})
        const names: string[] = []
        for (const button of await $(navigationLocators.plusDialog).$$(navigationLocators.anyButton)) {
            // getText (texte visible) et non le nom accessible : `getComputedLabel` n'existe pas dans la WebView iOS.
            const text = (await button.getText()).trim()
            if (text && text !== 'Fermer') names.push(text)
        }
        return names
    }

    /** Bouton « Retour à la page précédente » : revient d'une page enfant. */
    async goBack(): Promise<void> {
        await clickDisplayed(navigationLocators.back, {timeout: 5000})
    }

    /** Vérifie que la barre basse est affichée (page « onglet ») avec ses 5 boutons. */
    async assertBottomBarVisible(): Promise<void> {
        for (const tab of ['Accueil', 'Agenda', 'Services', 'Suivi', 'Plus'] as const) {
            await expect($(navigationLocators.bottomBar).$(navigationLocators.tab(tab))).toBeDisplayed()
        }
    }
}

export default traced(new NavigationPage(), 'NavigationPage')
