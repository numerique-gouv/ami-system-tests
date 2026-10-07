import {servicesLocators} from './locators/services.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButtonUntilGone, visibleButtonTexts, waitForButtons, waitForHeading, findRole} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de Services : onglets, checklists éditoriales, fiche d'un service partenaire. */
class ServicesPage {
    async open(): Promise<void> {
        await NavigationPage.goToTab('Services')
    }

    /** Vérifie l'arrivée sur la page Services (titre). */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(servicesLocators.pageTitle)
    }

    /** Sélectionne un onglet (`role=tab`) et attend qu'il soit actif. */
    async selectTab(label: string): Promise<void> {
        await platform().inWebContext(async () => {
            const tab = await findRole('tab', label, {timeout: 10000})
            await tab.click()
            await browser.waitUntil(async () => (await tab.getAttribute('aria-selected')) === 'true', {
                timeout: 5000, interval: 200, timeoutMsg: `Onglet "${label}" non sélectionné`,
            })
        })
    }

    /** Attend que les entrées données (texte exact ou préfixe) soient rendues dans l'onglet courant. */
    async waitForEntries(names: Array<string | RegExp>): Promise<void> {
        await waitForButtons(names)
    }

    async buttonTexts(): Promise<string[]> {
        return await visibleButtonTexts()
    }

    async assertHelpTabSections(): Promise<void> {
        await waitForHeading(servicesLocators.sosHeading)
        await waitForHeading(servicesLocators.checklistsHeading)
        await waitForHeading(servicesLocators.directoryHeading)
    }

    /** Ouvre une checklist par son libellé : la page d'origine est quittée quand son bouton disparaît. */
    async openChecklist(label: string): Promise<void> {
        await clickButtonUntilGone(label)
    }

    /**
     * Sections de la checklist ouverte (boutons terminés par un compteur « n/m »). Attend qu'au moins
     * une section soit rendue : la méthode s'assure elle-même d'être sur la bonne page.
     */
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

    /**
     * Nombre de cases à cocher de la section ouverte, et combien sont cochées — sans y toucher. Attend
     * qu'au moins une case soit rendue.
     */
    async checklistProgress(): Promise<{total: number; checked: number}> {
        let states: boolean[] = []
        await browser.waitUntil(async () => {
            states = Object.values(await checkboxStates())
            return states.length > 0
        }, {timeout: 10000, interval: 300, timeoutMsg: 'Aucune case à cocher affichée après 10000ms'})
        return {total: states.length, checked: states.filter(Boolean).length}
    }

    /**
     * Ouvre la fiche interne du service « Opération Tranquillité Vacances » par sa route. La carte de
     * l'onglet « Démarches et outils » quitte la SPA (navigation externe, destination non confirmée) ;
     * seule celle du carrousel de l'accueil mène à cette fiche (cf. HomePage.openOtvCard).
     */
    async openOperationTranquilliteVacances(): Promise<void> {
        await NavigationPage.goToRoute(servicesLocators.otvRoute)
    }

    async assertBenefitButtonOffered(): Promise<void> {
        await platform().inWebContext(async () => {
            await findRole('heading', servicesLocators.otvServiceTitle, {timeout: 10000})
            await findRole('button', servicesLocators.otvBenefitButtonName, {timeout: 10000})
        })
    }
}

export default traced(new ServicesPage(), 'ServicesPage')
