import {navigationLocators} from './locators/navigation.locators'
import type {PlusEntry, TabName} from './locators/navigation.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import HomePage from './home.page'
import {findRole, findRoleNames} from '../helpers/spa'

/**
 * Navigation principale de la SPA : barre basse (Accueil, Agenda, Services, Suivi), menu « Plus »
 * et navigation directe par hash. Partagée par toutes les pages « onglet » — les Page Objects
 * métier (Agenda, Services…) ne portent que leurs propres actions.
 */
class NavigationPage {
    /** Navigue directement vers une route (ex. `/network-error`) sans recharger la SPA. */
    async goToRoute(route: string): Promise<void> {
        await platform().inWebContext(async () => {
            await driver.execute((r: string) => { window.location.hash = r }, route)
        })
    }

    /**
     * Clique un onglet de la barre basse. La page d'origine ne connaît pas la suivante : l'arrivée est
     * vérifiée par la page cible (ses propres méthodes, ex. `AgendaPage.assertDisplayed()`).
     */
    async goToTab(tab: TabName): Promise<void> {
        await platform().inWebContext(async () => {
            await HomePage.closeOpenNavPlusMenu()
            const button = await findRole('button', tab, {timeout: 10000})
            await button.click()
        })
    }

    /** Ouvre le menu « Plus » (dialogue). Idempotent : sans effet s'il est déjà ouvert. */
    async openPlusMenu(): Promise<void> {
        if (await HomePage.isMenuPlusVisible()) return
        await platform().inWebContext(async () => {
            const plus = await findRole('button', navigationLocators.plusButtonName, {timeout: 10000})
            await plus.click()
            await findRole('heading', navigationLocators.plusDialogHeading, {timeout: 5000})
        })
    }

    /** Ouvre le menu « Plus » et clique une entrée. L'arrivée est vérifiée par la page cible. */
    async openPlusEntry(entry: PlusEntry): Promise<void> {
        await this.openPlusMenu()
        await platform().inWebContext(async () => {
            const item = await findRole('button', entry, {timeout: 5000})
            await item.click()
        })
    }

    /** Liste les entrées du menu « Plus » (menu ouvert par la méthode), hors bouton « Fermer ». */
    async listPlusEntries(): Promise<string[]> {
        await this.openPlusMenu()
        return await platform().inWebContext(async () => {
            const texts = await findRoleNames('button', undefined, {
                timeout: 10000, in: {role: 'dialog', name: navigationLocators.plusDialogHeading},
            })
            return texts.filter(t => t && t !== 'Fermer')
        })
    }

    /** Bouton « Retour à la page précédente » : revient d'une page enfant. */
    async goBack(): Promise<void> {
        await platform().inWebContext(async () => {
            const back = await findRole('button', 'Retour à la page précédente', {timeout: 5000})
            await back.click()
        })
    }

    /** Vérifie que la barre basse est affichée (page « onglet ») avec ses 5 boutons. */
    async assertBottomBarVisible(): Promise<void> {
        await platform().inWebContext(async () => {
            for (const tab of ['Accueil', 'Agenda', 'Services', 'Suivi', 'Plus']) {
                await findRole('button', tab, {timeout: 10000, in: {role: 'navigation', name: navigationLocators.bottomBarName}})
            }
        })
    }
}

export default traced(new NavigationPage(), 'NavigationPage')
