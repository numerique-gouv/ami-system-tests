import {stepsListLocators} from './locators/steps-list.locators'
import {traced} from '../helpers/reporting/traced'
import {allDisplayed, firstDisplayed, normalizeSpaces} from '../helpers/spa/spa'
import {followAndDescribe, type DeferredLink, type LinkTarget} from '../helpers/webapp/link-check'

async function visibleText(element: WebdriverIO.Element): Promise<string> {
    return normalizeSpaces(await element.getText())
}

export type StepsLinkKind = 'direct' | 'page'

export interface StepsLinkItem {
    kind: StepsLinkKind
    /** Nom accessible du bouton : le texte du lien (direct) ou « Voir le détail de ce point » (page intermédiaire). */
    label: string
}

/** Listes d'étapes (« Comment faire si… »), atteintes depuis `ServicesPage.openStepsList()`. Le contenu (wording, ordre) n'est pas contrôlé, seulement les liens. */
class StepsListPage {
    async assertDisplayed(): Promise<void> {
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
        await firstDisplayed(stepsListLocators.sectionButton, {timeout: 15000})
    }

    async title(): Promise<string> {
        return (await (await firstDisplayed(stepsListLocators.title)).getText()).trim()
    }

    async sections(): Promise<string[]> {
        await firstDisplayed(stepsListLocators.sectionButton, {timeout: 15000})
        const labels: string[] = []
        for (const section of await allDisplayed(stepsListLocators.sectionButton)) labels.push(await visibleText(section))
        return labels
    }

    /** Ouvre la section n° `index` et retourne sa route (`#/checklist/<id>/checks/<section>/`, sans requête). */
    async openSection(index: number): Promise<string> {
        const sections = await allDisplayed(stepsListLocators.sectionButton)
        await sections[index].click()
        await browser.waitUntil(async () => (await this.route()).includes('/checks/'), {
            timeout: 10000, interval: 200, timeoutMsg: `La section n° ${index} ne s'est pas ouverte`,
        })
        return await this.route()
    }

    async route(): Promise<string> {
        return await driver.execute(() => location.hash.split('?')[0]) as string
    }

    /** Revient à une route de la SPA (liste, section ou page d'item) après un lien externe, et attend son titre h1. */
    async returnTo(route: string): Promise<void> {
        await browser.url(`/${route}`)
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
    }

    /** Items à lien de la section ouverte, dans l'ordre du DOM. Lus par `execute` : ces boutons font 0×0 px, donc ne sont pas « affichés » au sens WebDriver. */
    async linkItems(): Promise<StepsLinkItem[]> {
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
        // Les items sont rendus après le titre ; leur case est transparente, d'où une attente sur `$$`.
        await browser.waitUntil(async () => (await $$(stepsListLocators.itemCheckbox)).length > 0, {
            timeout: 15000, interval: 200, timeoutMsg: 'Aucun item rendu dans la section après 15000ms',
        })
        return await driver.execute((selector: string, directPrefix: string) =>
            Array.from(document.querySelectorAll(selector)).map(b => ({
                kind: (b.getAttribute('data-testid') || '').startsWith(directPrefix) ? 'direct' : 'page',
                label: (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim(),
            })), stepsListLocators.itemLinkButton, stepsListLocators.directLinkPrefix) as StepsLinkItem[]
    }

    private async clickLinkItem(index: number): Promise<void> {
        await driver.execute((selector: string, i: number) => (document.querySelectorAll(selector)[i] as HTMLElement).click(),
            stepsListLocators.itemLinkButton, index)
    }

    /** Suit un item à lien direct : la cible est une page externe, décrite sans son URL complète. `deferExternal` : voir `followAndDescribe`. */
    async followDirectLink(index: number): Promise<LinkTarget>
    async followDirectLink(index: number, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
    async followDirectLink(index: number, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
        const click = async (): Promise<void> => this.clickLinkItem(index)
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }

    async openItemPage(index: number): Promise<string> {
        await this.clickLinkItem(index)
        await browser.waitUntil(async () => (await this.route()).includes(stepsListLocators.itemRouteFragment), {
            timeout: 10000, interval: 200, timeoutMsg: `L'item n° ${index} n'a pas ouvert de page intermédiaire`,
        })
        return await this.route()
    }

    async itemPageLinks(): Promise<string[]> {
        await firstDisplayed(stepsListLocators.itemPageLink, {timeout: 10000})
        const labels: string[] = []
        for (const button of await allDisplayed(stepsListLocators.itemPageLink)) {
            const label = await visibleText(button)
            if (label && label !== stepsListLocators.backButtonName) labels.push(label)
        }
        return labels
    }

    /** Suit le lien n° `index` (rang dans `itemPageLinks()`) de la page intermédiaire d'un item. `deferExternal` : comme `followDirectLink`. */
    async followItemPageLink(index: number): Promise<LinkTarget>
    async followItemPageLink(index: number, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
    async followItemPageLink(index: number, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
        const click = async (): Promise<void> => {
            const links = await allDisplayed(stepsListLocators.itemPageLink)
            const named: WebdriverIO.Element[] = []
            for (const link of links) {
                const label = await visibleText(link)
                if (label && label !== stepsListLocators.backButtonName) named.push(link)
            }
            await named[index].click()
        }
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }
}

export default traced(new StepsListPage(), 'StepsListPage')
