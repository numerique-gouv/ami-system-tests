import {servicesLocators} from './locators/services.locators'
import {platform} from '../platform'
import {tl} from '../helpers/webview'
import {traced} from '../helpers/traced'
import {checkboxStates, clickButton, visibleButtonTexts, waitForButtons, waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Page Object de Services : onglets, checklists éditoriales, fiche d'un service partenaire. */
class ServicesPage {
    async open(): Promise<void> {
        await NavigationPage.goToTab('Services')
    }

    /** Sélectionne un onglet (`role=tab`) et attend qu'il soit actif. */
    async selectTab(label: string): Promise<void> {
        await platform().inWebContext(async () => {
            const tab = await tl().findByRole('tab', {name: label}, {timeout: 10000})
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

    /** Ouvre une checklist par son libellé et attend son titre. */
    async openChecklist(label: string): Promise<void> {
        await clickButton(label)
        await waitForHeading(label)
    }

    /** Sections d'une checklist ouverte (boutons terminés par un compteur « n/m »). */
    async checklistSections(): Promise<string[]> {
        return (await visibleButtonTexts()).filter(t => servicesLocators.checklistSectionPattern.test(t))
    }

    /** Ouvre une section (libellé complet, compteur compris) et attend son titre (sans compteur). */
    async openChecklistSection(sectionLabel: string): Promise<void> {
        await clickButton(sectionLabel)
        await waitForHeading(sectionLabel.replace(servicesLocators.checklistSectionPattern, '').trim())
    }

    /** Nombre de cases à cocher de la section ouverte, et combien sont cochées — sans y toucher. */
    async checklistProgress(): Promise<{total: number; checked: number}> {
        const states = Object.values(await checkboxStates())
        return {total: states.length, checked: states.filter(Boolean).length}
    }

    /**
     * Ouvre la fiche interne du service « Opération Tranquillité Vacances » par sa route. La carte de
     * l'onglet « Démarches et outils » quitte la SPA (navigation externe, destination non confirmée) ;
     * seule celle du carrousel de l'accueil mène à cette fiche (cf. HomePage.openOtvCard).
     */
    async openOperationTranquilliteVacances(): Promise<void> {
        await NavigationPage.goToRoute(servicesLocators.otvRoute)
        await NavigationPage.waitForHash(/#\/services\/service\/psl\/OperationTranquilliteVacances$/)
        await waitForHeading(servicesLocators.otvServiceTitle)
    }

    async assertBenefitButtonOffered(): Promise<void> {
        await platform().inWebContext(async () => {
            await tl().findByRole('button', {name: servicesLocators.otvBenefitButtonName}, {timeout: 5000})
        })
    }
}

export default traced(new ServicesPage(), 'ServicesPage')
