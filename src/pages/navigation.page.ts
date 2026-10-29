import {navigationLocators} from './locators/navigation.locators'
import type {PlusEntry, TabName} from './locators/navigation.locators'
import {traced} from '../helpers/reporting/traced'
import {clickDisplayed} from '../helpers/spa/spa'

/** Barre basse, menu « Plus » et navigation directe par hash, partagés par toutes les pages « onglet ». */
class NavigationPage {
    /** Navigue directement vers une route (ex. `/network-error`) sans recharger la SPA. */
    async goToRoute(route: string): Promise<void> {
        await driver.execute((r: string) => { window.location.hash = r }, route)
    }

    /** L'arrivée est vérifiée par la page cible. */
    async goToTab(tab: TabName): Promise<void> {
        await this.closePlusMenu()
        await clickDisplayed(navigationLocators.tab(tab), {timeout: 10000, within: navigationLocators.bottomBar})
    }

    private async isPlusMenuOpen(): Promise<boolean> {
        return (await $$(navigationLocators.plusDialogOpened)).length > 0
    }

    /** Idempotent. Le clic donné juste après un changement de page peut être perdu (dialogue pas encore initialisé par le DSFR) : on le rejoue tant qu'il n'est pas ouvert. */
    async openPlusMenu(): Promise<void> {
        // Ouvert ET affiché : la SPA peut remplacer aussitôt un dialogue déjà marqué ouvert.
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
        }, {timeout: 15000, interval: 100, timeoutMsg: 'Le menu « Plus » ne s’ouvre pas après 15000ms'})
    }

    /** Ferme le menu « Plus » s'il est ouvert : en webapp, il reste parfois ouvert après le login et intercepte le clic suivant. */
    async closePlusMenu(): Promise<void> {
        const close = $(navigationLocators.plusDialogClose)
        if (await close.isExisting()) await close.click()
    }

    /** Ouvre le menu « Plus » et clique une entrée. L'arrivée est vérifiée par la page cible. */
    async openPlusEntry(entry: PlusEntry): Promise<void> {
        await this.openPlusMenu()
        await clickDisplayed(navigationLocators.plusEntry(entry), {timeout: 10000, within: navigationLocators.plusDialog})
    }

    async goBack(): Promise<void> {
        await clickDisplayed(navigationLocators.back, {timeout: 5000})
    }
}

export default traced(new NavigationPage(), 'NavigationPage')
