import {navigationLocators} from './locators/navigation.locators'
import type {PlusEntry, TabName} from './locators/navigation.locators'
import {platform} from '../platform'
import {tl} from '../helpers/webview'
import {traced} from '../helpers/traced'
import HomePage from './home.page'
import {AssertionError} from 'node:assert'

/**
 * Navigation principale de la SPA : barre basse (Accueil, Agenda, Services, Suivi), menu « Plus »
 * et navigation directe par hash. Partagée par toutes les pages « onglet » — les Page Objects
 * métier (Agenda, Services…) ne portent que leurs propres actions.
 */
class NavigationPage {
    /** Hash courant, sans query string (ex. `#/profile`). */
    async currentHash(): Promise<string> {
        return await platform().inWebContext(() => driver.execute(() => location.hash) as Promise<string>)
    }

    /** Attend que le hash de la SPA corresponde à `expected`. */
    async waitForHash(expected: RegExp, timeout = 10000): Promise<void> {
        await platform().inWebContext(() =>
            browser.waitUntil(async () => expected.test(await driver.execute(() => location.hash) as string), {
                timeout, interval: 300,
                timeoutMsg: `Le hash de la SPA ne correspond pas à ${expected} (hash courant lu en fin d'attente)`,
            })
        )
    }

    /** Attend un titre (heading) visible — sentinelle de rendu d'une page (CONTRIBUTING.md §4). */
    async waitForHeading(name: string | RegExp, timeout = 10000): Promise<void> {
        await platform().inWebContext(async () => {
            await tl().findByRole('heading', {name}, {timeout})
        })
    }

    /** Navigue directement vers une route (ex. `/network-error`) sans recharger la SPA. */
    async goToRoute(route: string): Promise<void> {
        await platform().inWebContext(async () => {
            await driver.execute((r: string) => { window.location.hash = r }, route)
        })
    }

    /** Clique un onglet de la barre basse et attend le titre de sa page. */
    async goToTab(tab: TabName): Promise<void> {
        await platform().inWebContext(async () => {
            await HomePage.closeOpenNavPlusMenu()
            const button = await tl().findByRole('button', {name: tab}, {timeout: 10000})
            await button.click()
        })
        await this.waitForHeading(navigationLocators.tabHeading[tab])
    }

    /** Ouvre le menu « Plus » (dialogue). Idempotent : sans effet s'il est déjà ouvert. */
    async openPlusMenu(): Promise<void> {
        if (await HomePage.isMenuPlusVisible()) return
        await platform().inWebContext(async () => {
            const plus = await tl().findByRole('button', {name: navigationLocators.plusButtonName}, {timeout: 10000})
            await plus.click()
            await tl().findByRole('heading', {name: navigationLocators.plusDialogHeading}, {timeout: 5000})
        })
    }

    /** Ouvre le menu « Plus », clique une entrée et attend la page atteinte (hash + titre). */
    async openPlusEntry(entry: PlusEntry): Promise<void> {
        await this.openPlusMenu()
        await platform().inWebContext(async () => {
            const item = await tl().findByRole('button', {name: entry}, {timeout: 5000})
            await item.click()
        })
        await this.waitForHash(navigationLocators.plusEntryHash[entry])
        await this.waitForHeading(navigationLocators.plusEntryHeading[entry])
    }

    /** Liste les entrées visibles du menu « Plus » (menu ouvert par la méthode). */
    async listPlusEntries(): Promise<string[]> {
        await this.openPlusMenu()
        return await platform().inWebContext(() =>
            driver.execute(() => {
                const dialog = document.querySelector('dialog[id^="modal-main-nav-plus"].fr-modal--opened')
                return Array.from(dialog?.querySelectorAll('button') ?? [])
                    .map(b => (b as HTMLElement).innerText.trim())
                    .filter(t => t && t !== 'Fermer')
            }) as Promise<string[]>
        )
    }

    /** Bouton « Retour à la page précédente » : revient d'une page enfant. */
    async goBack(): Promise<void> {
        await platform().inWebContext(async () => {
            const back = await tl().findByRole('button', {name: 'Retour à la page précédente'}, {timeout: 5000})
            await back.click()
        })
    }

    /** Vérifie que la barre basse est affichée (page « onglet »). */
    async assertBottomBarVisible(): Promise<void> {
        const names = await platform().inWebContext(() =>
            driver.execute(() => Array.from(document.querySelectorAll('button'))
                .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
                .map(b => (b as HTMLElement).innerText.trim())) as Promise<string[]>
        )
        for (const tab of ['Accueil', 'Agenda', 'Services', 'Suivi', 'Plus']) {
            if (!names.includes(tab)) throw new AssertionError({message: `Barre basse : bouton "${tab}" absent (boutons visibles : ${names.join(' | ')})`})
        }
    }
}

export default traced(new NavigationPage(), 'NavigationPage')
