import {navigationLocators} from './locators/navigation.locators'
import type {PlusEntry, TabName} from './locators/navigation.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {clickDisplayed, firstDisplayed} from '../helpers/spa'

/**
 * Navigation principale de la SPA : barre basse (Accueil, Agenda, Services, Suivi), menu « Plus »
 * et navigation directe par hash. Partagée par toutes les pages « onglet » — les Page Objects
 * métier (Agenda, Services…) ne portent que leurs propres actions.
 */
class NavigationPage {
    /** Navigue directement vers une route (ex. `/network-error`) sans recharger la SPA. */
    async goToRoute(route: string): Promise<void> {
        await platform().inWebContext(async () => {
            // driver.execute : aucun bouton ne mène à ces routes (ex. /network-error) — navigation directe par hash.
            await driver.execute((r: string) => { window.location.hash = r }, route)
        })
    }

    /**
     * Clique un onglet de la barre basse. La page d'origine ne connaît pas la suivante : l'arrivée est
     * vérifiée par la page cible (ses propres méthodes, ex. `AgendaPage.assertDisplayed()`).
     */
    async goToTab(tab: TabName): Promise<void> {
        await platform().inWebContext(async () => {
            await this.closePlusMenu()
            await clickDisplayed(navigationLocators.tab(tab), {timeout: 10000, within: navigationLocators.bottomBar})
        })
    }

    /** Le dialogue du menu « Plus » est-il ouvert ? */
    async isPlusMenuOpen(): Promise<boolean> {
        return await platform().inWebContext(async () => (await $$(navigationLocators.plusDialogOpened)).length > 0)
    }

    /** Ouvre le menu « Plus » (dialogue). Idempotent : sans effet s'il est déjà ouvert. */
    async openPlusMenu(): Promise<void> {
        await platform().inWebContext(async () => {
            if (await this.isPlusMenuOpen()) return
            await clickDisplayed(navigationLocators.tab('Plus'), {timeout: 10000, within: navigationLocators.bottomBar})
            await firstDisplayed(navigationLocators.plusDialog, {timeout: 5000})
        })
    }

    /**
     * Ferme le menu « Plus » s'il est ouvert (sans effet sinon, sans attente). Observé en webapp (Chrome desktop) juste
     * après le login : ce dialogue DSFR reste ouvert sans qu'aucun clic ne l'ait ouvert et recouvre l'écran, ce qui
     * intercepte le clic suivant ("element click intercepted"). Non reproduit sur WebView Android/iOS — cause côté app
     * non élucidée, contournement test uniquement. Pas d'avertissement : un scénario peut l'avoir ouvert lui-même
     * (`listPlusEntries()`). Le menu est aussi le menu profil/avatar.
     */
    async closePlusMenu(): Promise<void> {
        await platform().inWebContext(async () => {
            const close = $(navigationLocators.plusDialogClose)
            if (await close.isExisting()) await close.click()
        })
    }

    /** Ouvre le menu « Plus » et clique une entrée. L'arrivée est vérifiée par la page cible. */
    async openPlusEntry(entry: PlusEntry): Promise<void> {
        await platform().inWebContext(async () => {
            await this.openPlusMenu()
            await clickDisplayed(navigationLocators.plusEntry(entry), {timeout: 5000, within: navigationLocators.plusDialog})
        })
    }

    /** Liste les entrées du menu « Plus » (menu ouvert par la méthode), hors bouton « Fermer » (sans texte visible). */
    async listPlusEntries(): Promise<string[]> {
        return await platform().inWebContext(async () => {
            await this.openPlusMenu()
            await firstDisplayed(navigationLocators.anyButton, {timeout: 10000, within: navigationLocators.plusDialog})
            const names: string[] = []
            for (const button of await $(navigationLocators.plusDialog).$$(navigationLocators.anyButton)) {
                // getText (texte visible) et non le nom accessible : `getComputedLabel` n'existe pas dans la WebView iOS.
                const text = (await button.getText()).trim()
                if (text && text !== 'Fermer') names.push(text)
            }
            return names
        })
    }

    /** Bouton « Retour à la page précédente » : revient d'une page enfant. */
    async goBack(): Promise<void> {
        await clickDisplayed(navigationLocators.back, {timeout: 5000})
    }

    /** Vérifie que la barre basse est affichée (page « onglet ») avec ses 5 boutons. */
    async assertBottomBarVisible(): Promise<void> {
        await platform().inWebContext(async () => {
            for (const tab of ['Accueil', 'Agenda', 'Services', 'Suivi', 'Plus'] as const) {
                await expect($(navigationLocators.bottomBar).$(navigationLocators.tab(tab))).toBeDisplayed()
            }
        })
    }
}

export default traced(new NavigationPage(), 'NavigationPage')
