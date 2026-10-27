import {stepsListLocators} from './locators/steps-list.locators'
import {traced} from '../helpers/reporting/traced'
import {allDisplayed, firstDisplayed} from '../helpers/spa/spa'
import {followAndDescribe, type DeferredLink, type LinkTarget} from '../helpers/webapp/link-check'

export type StepsLinkKind = 'direct' | 'page'

export interface StepsLinkItem {
    kind: StepsLinkKind
    /** Nom accessible du bouton : le texte du lien pour un lien direct, « Voir le détail de ce point » pour une page intermédiaire. */
    label: string
}

/**
 * Page Object des listes d'étapes (« Comment faire si… ») : sections, items à lien, page intermédiaire d'un item.
 * Atteinte depuis `ServicesPage.openStepsList()`. Les liens sortants sont contrôlés comme ceux du catalogue
 * (`followAndDescribe` : jamais l'URL complète dans les journaux). Le contenu (wording, ordre) n'est pas contrôlé :
 * « ce n'est pas nous qui avons la main sur le wording » (réunion, 21:34).
 */
class StepsListPage {
    /** Vérifie l'arrivée sur une liste d'étapes : titre h1 et au moins une section. */
    async assertDisplayed(): Promise<void> {
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
        await firstDisplayed(stepsListLocators.sectionButton, {timeout: 15000})
    }

    /** Titre h1 de la liste (ex. « Je suis affecté à l'étranger »). */
    async title(): Promise<string> {
        return (await (await firstDisplayed(stepsListLocators.title)).getText()).trim()
    }

    /** Libellés des sections (« Cas général 0/7 »), dans l'ordre. */
    async sections(): Promise<string[]> {
        await firstDisplayed(stepsListLocators.sectionButton, {timeout: 15000})
        const labels: string[] = []
        for (const section of await allDisplayed(stepsListLocators.sectionButton)) labels.push((await section.getText()).replace(/\s+/g, ' ').trim())
        return labels
    }

    /** Ouvre la section n° `index` et retourne sa route (`#/checklist/<id>/checks/<section>/`, sans requête). */
    async openSection(index: number): Promise<string> {
        const sections = await allDisplayed(stepsListLocators.sectionButton)
        await sections[index].click()
        await browser.waitUntil(async () => (await this.route()).includes('/checks/'), {
            timeout: 10000, interval: 200, timeoutMsg: `La section n° ${index} ne s'est pas ouverte (route : ${await this.route()})`,
        })
        return await this.route()
    }

    /** Route courante de la SPA (fragment sans requête). */
    async route(): Promise<string> {
        return await driver.execute(() => location.hash.split('?')[0]) as string
    }

    /** Revient à une route de la SPA (liste, section ou page d'item) après un lien externe, et attend son titre h1. */
    async returnTo(route: string): Promise<void> {
        await browser.url(`/${route}`)
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
    }

    /**
     * Items à lien de la section ouverte, dans l'ordre du DOM. Lus par `execute` : ces boutons font 0×0 px, donc ne sont pas
     * « affichés » au sens WebDriver.
     */
    async linkItems(): Promise<StepsLinkItem[]> {
        await firstDisplayed(stepsListLocators.title, {timeout: 15000})
        // Les items sont rendus après le titre ; leur case est transparente (non « affichée »), d'où une attente sur `$$` (plusieurs cases : `$` serait « strict »).
        await browser.waitUntil(async () => (await $$('li input[type="checkbox"]')).length > 0, {
            timeout: 15000, interval: 200, timeoutMsg: 'Aucun item rendu dans la section après 15000ms',
        })
        return await driver.execute((selector: string, directPrefix: string) =>
            Array.from(document.querySelectorAll(selector)).map(b => ({
                kind: (b.getAttribute('data-testid') || '').startsWith(directPrefix) ? 'direct' : 'page',
                label: (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim(),
            })), stepsListLocators.itemLinkButton, stepsListLocators.directLinkPrefix) as StepsLinkItem[]
    }

    /** Clique l'item à lien n° `index` : `HTMLElement.click()`, car le bouton fait 0×0 px (voir les locators). */
    private async clickLinkItem(index: number): Promise<void> {
        await driver.execute((selector: string, i: number) => (document.querySelectorAll(selector)[i] as HTMLElement).click(),
            stepsListLocators.itemLinkButton, index)
    }

    /**
     * Suit un item à LIEN DIRECT : la cible est une page externe, décrite sans son URL complète. Avec `deferExternal`, une cible externe
     * sans jeton est interceptée au clic (page non chargée, restée affichée) : voir `followAndDescribe`.
     */
    async followDirectLink(index: number): Promise<LinkTarget>
    async followDirectLink(index: number, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
    async followDirectLink(index: number, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
        const click = async (): Promise<void> => this.clickLinkItem(index)
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }

    /** Ouvre la page INTERMÉDIAIRE d'un item à plusieurs liens et attend sa route (`…/item/<id>/`). */
    async openItemPage(index: number): Promise<string> {
        await this.clickLinkItem(index)
        await browser.waitUntil(async () => (await this.route()).includes(stepsListLocators.itemRouteFragment), {
            timeout: 10000, interval: 200, timeoutMsg: `L'item n° ${index} n'a pas ouvert de page intermédiaire (route : ${await this.route()})`,
        })
        return await this.route()
    }

    /** Libellés des liens de la page intermédiaire d'un item (hors bouton « Retour »). */
    async itemPageLinks(): Promise<string[]> {
        await firstDisplayed(stepsListLocators.itemPageLink, {timeout: 10000})
        const labels: string[] = []
        for (const button of await allDisplayed(stepsListLocators.itemPageLink)) {
            const label = (await button.getText()).replace(/\s+/g, ' ').trim()
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
                const label = (await link.getText()).replace(/\s+/g, ' ').trim()
                if (label && label !== stepsListLocators.backButtonName) named.push(link)
            }
            await named[index].click()
        }
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }
}

export default traced(new StepsListPage(), 'StepsListPage')
