import {servicesLocators} from './locators/services.locators'
import {stepsListLocators} from './locators/steps-list.locators'
import {traced} from '../helpers/reporting/traced'
import {allDisplayed, checkboxStates, clickButton, clickButtonUntilGone, firstDisplayed, normalizeSpaces, visibleButtonTexts, waitForHeading} from '../helpers/spa/spa'
import {followAndDescribe, type DeferredLink, type LinkTarget} from '../helpers/webapp/link-check'
import NavigationPage from './navigation.page'

async function visibleText(element: WebdriverIO.Element): Promise<string> {
    return normalizeSpaces(await element.getText())
}

class ServicesPage {
    async open(): Promise<void> {
        await NavigationPage.goToTab('Services')
    }

    async assertDisplayed(): Promise<void> {
        await waitForHeading(servicesLocators.pageTitle)
    }

    async selectTab(label: string): Promise<void> {
        await this.assertDisplayed()
        const tab = await firstDisplayed(servicesLocators.tab(label), {timeout: 10000})
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true', {wait: 5000})
    }

    /** Revient sur Services après un lien externe (la session FranceConnect est conservée par le profil du navigateur). */
    async returnFromExternal(): Promise<void> {
        await browser.url('/#/services')
        await this.assertDisplayed()
    }

    /** Libellés des cartes de l'onglet « Démarches et outils », dans l'ordre. */
    async catalogueLabels(): Promise<string[]> {
        await this.selectTab(servicesLocators.catalogueTabName)
        const within = servicesLocators.tabpanel(servicesLocators.catalogueTabName)
        await firstDisplayed(servicesLocators.catalogueCard, {within, timeout: 15000})
        const labels: string[] = []
        for (const card of await allDisplayed(servicesLocators.catalogueCard, {within})) {
            labels.push(await visibleText(card))
        }
        return labels
    }

    /**
     * Clique la carte n° `index` (rang dans `catalogueLabels()`) et décrit la page atteinte, sans exposer son URL (jetons : voir `followAndDescribe`).
     * `deferExternal` : une cible externe sans jeton est interceptée, l'appelant reçoit un `DeferredLink` à contrôler par `describeByHttp`.
     */
    async openCatalogueCard(index: number): Promise<LinkTarget>
    async openCatalogueCard(index: number, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
    async openCatalogueCard(index: number, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
        const click = async (): Promise<void> => {
            const within = servicesLocators.tabpanel(servicesLocators.catalogueTabName)
            const cards = await allDisplayed(servicesLocators.catalogueCard, {within})
            await cards[index].click()
        }
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }

    /** Comme `openCatalogueCard`, pour la première carte dont le libellé commence par `labelStart`. */
    async openCatalogueCardNamed(labelStart: string): Promise<LinkTarget> {
        const index = (await this.catalogueLabels()).findIndex(label => label.startsWith(labelStart))
        if (index < 0) throw new Error(`Aucune carte du catalogue ne commence par « ${labelStart} »`)
        return await this.openCatalogueCard(index)
    }

    /** Comme `openCatalogueCard`, pour la première carte dont le libellé contient `fragment`. */
    async openCatalogueCardContaining(fragment: string): Promise<LinkTarget> {
        const index = (await this.catalogueLabels()).findIndex(label => label.includes(fragment))
        if (index < 0) throw new Error(`Aucune carte du catalogue ne contient « ${fragment} »`)
        return await this.openCatalogueCard(index)
    }

    /** Libellés de tous les boutons de l'onglet « Trouver de l’aide » : SOS, checklists, annuaire. */
    async helpLabels(): Promise<string[]> {
        await this.selectTab(servicesLocators.helpTabName)
        const within = servicesLocators.tabpanel(servicesLocators.helpTabName)
        await firstDisplayed('button', {within, timeout: 15000})
        const labels: string[] = []
        for (const entry of await allDisplayed('button', {within})) labels.push(await visibleText(entry))
        return labels
    }

    /** Libellés des entrées de « Trouver de l’aide » qui ouvrent une liste d'étapes (« Comment faire si… »), dans l'ordre. */
    async stepsListLabels(): Promise<string[]> {
        await this.selectTab(servicesLocators.helpTabName)
        const within = servicesLocators.tabpanel(servicesLocators.helpTabName)
        await firstDisplayed(stepsListLocators.listEntry, {within, timeout: 15000})
        const labels: string[] = []
        for (const entry of await allDisplayed(stepsListLocators.listEntry, {within})) labels.push(await visibleText(entry))
        return labels
    }

    /** Ouvre la liste d'étapes n° `index` (rang dans `stepsListLabels()`). L'arrivée est vérifiée par `StepsListPage.assertDisplayed()`. */
    async openStepsList(index: number): Promise<void> {
        await this.selectTab(servicesLocators.helpTabName)
        const within = servicesLocators.tabpanel(servicesLocators.helpTabName)
        await (await allDisplayed(stepsListLocators.listEntry, {within}))[index].click()
    }

    /**
     * Clique l'entrée n° `index` (rang dans `helpLabels()`) de « Trouver de l’aide » et décrit la page atteinte, sans exposer l'URL complète.
     * Défilement en JavaScript : celui de WDIO laisse la dernière entrée sous la barre de navigation basse (clic intercepté, défaut du test et non de l'app).
     * `deferExternal` : comme pour `openCatalogueCard`.
     */
    async openHelpEntry(index: number): Promise<LinkTarget>
    async openHelpEntry(index: number, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
    async openHelpEntry(index: number, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
        const click = async (): Promise<void> => {
            const within = servicesLocators.tabpanel(servicesLocators.helpTabName)
            // Les entrées sont rendues progressivement après un rechargement.
            let entries: WebdriverIO.Element[] = []
            await browser.waitUntil(async () => (entries = await allDisplayed('button', {within})).length > index, {
                timeout: 15000, interval: 300,
                timeoutMsg: `L'entrée n° ${index} de « Trouver de l’aide » n'est pas affichée après 15000ms`,
            })
            const entry = entries[index]
            await browser.execute((el: HTMLElement) => el.scrollIntoView({block: 'center'}), entry as unknown as HTMLElement)
            // Clic JavaScript : le « click » WebDriver attend la fin du chargement de la cible, qui peut ne jamais répondre ; `followAndDescribe` attend la navigation.
            await browser.execute((el: HTMLElement) => el.click(), entry as unknown as HTMLElement)
        }
        return options ? await followAndDescribe(click, options) : await followAndDescribe(click)
    }

    /** Ouvre « Je suis victime de cybermalveillance » (route interne) et retourne l'adresse de ses iframes. */
    async openCyberDiagnostic(): Promise<string[]> {
        await this.selectTab(servicesLocators.helpTabName)
        await clickButton(servicesLocators.cyberDiagnosticName)
        await firstDisplayed(servicesLocators.cyberIframe, {timeout: 15000})
        const sources: string[] = []
        for (const frame of await allDisplayed(servicesLocators.cyberIframe)) {
            const src = await frame.getAttribute('src')
            if (src) sources.push(src)
        }
        return sources
    }

    /** Attend que les entrées données (fragment du texte du bouton) soient rendues dans l'onglet courant. */
    async waitForEntries(fragments: string[]): Promise<void> {
        await this.assertDisplayed()
        for (const fragment of fragments) {
            await firstDisplayed(servicesLocators.entryContaining(fragment), {timeout: 15000})
        }
    }

    async assertHelpTabSections(): Promise<void> {
        await this.assertDisplayed()
        await waitForHeading(servicesLocators.sosHeading)
        await waitForHeading(servicesLocators.checklistsHeading)
        await waitForHeading(servicesLocators.directoryHeading)
    }

    /** Ouvre une checklist par son libellé : la page d'origine est quittée quand son bouton disparaît. */
    async openChecklist(label: string): Promise<void> {
        await clickButtonUntilGone(label)
    }

    /** Sections de la checklist ouverte (boutons terminés par un compteur « n/m »). */
    async checklistSections(): Promise<string[]> {
        let sections: string[] = []
        await browser.waitUntil(async () => {
            sections = (await visibleButtonTexts()).filter(t => servicesLocators.checklistSectionPattern.test(t))
            return sections.length > 0
        }, {timeout: 10000, interval: 300, timeoutMsg: 'Aucune section de checklist affichée après 10000ms'})
        return sections
    }

    /** Ouvre une section (libellé complet, compteur compris) : la liste des sections est quittée quand son bouton disparaît. */
    async openChecklistSection(sectionLabel: string): Promise<void> {
        await clickButtonUntilGone(sectionLabel)
    }

    /** Nombre de cases à cocher de la section ouverte, et combien sont cochées. */
    async checklistProgress(): Promise<{total: number; checked: number}> {
        let states: boolean[] = []
        await browser.waitUntil(async () => {
            states = Object.values(await checkboxStates())
            return states.length > 0
        }, {timeout: 10000, interval: 300, timeoutMsg: 'Aucune case à cocher affichée après 10000ms'})
        return {total: states.length, checked: states.filter(Boolean).length}
    }

    /** La carte du catalogue quitte la SPA : la fiche interne n'est atteinte que par sa route. */
    async openOperationTranquilliteVacances(): Promise<void> {
        await NavigationPage.goToRoute(servicesLocators.otvRoute)
    }

    async assertBenefitButtonOffered(): Promise<void> {
        await firstDisplayed(servicesLocators.otvServiceHeading)
        await firstDisplayed(servicesLocators.otvBenefitButton)
    }
}

export default traced(new ServicesPage(), 'ServicesPage')
