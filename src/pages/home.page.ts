import {homeContentLocators} from './locators/home.locators'
import {describeCurrentPage} from '../helpers/webview';
import {clickButton, visibleButtonTexts, waitForHeading, pageText, findRole, hasRole, queryRole} from '../helpers/spa'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {AssertionError} from "node:assert";

class HomePage {
    /**
     * Attend que la SPA home authentifiée soit chargée : titre « Bonjour <prénom> » (<h1>), seul affiché par la
     * home — les 5 boutons de la barre de nav sont présents sur tous les écrans, et la route seule ne distingue
     * pas la home de la page « not connected » (écran de login FranceConnect, même route).
     *
     * Ne ferme aucun écran de blocage (onboardings, menu « Plus ») : c'est le rôle du scénario, qui les passe
     * explicitement (`getAppToStartingState` pour les autres tests).
     *
     * Échec dur (throw) plutôt que booléen : centralise le diagnostic (describeCurrentPage()) pour ses appelants.
     */
    async assertHomeVisible(timeout = 30000): Promise<void> {
        if (await this.isHomeDisplayed(timeout)) return
        const where = await describeCurrentPage()
        throw new AssertionError({message: `assertHomeVisible: Home non atteinte (${where})`})
    }

    /** Sonde : la salutation « Bonjour <prénom> » est-elle affichée sous `timeout` ms ? Sans cascade de récupération. */
    async isHomeDisplayed(timeout: number): Promise<boolean> {
        return await hasRole('heading', homeContentLocators.greetingPattern, timeout)
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le bouton de la nav. L'arrivée est vérifiée par
     * la page Suivi (`SuiviDemarchesPage.assertDisplayed()` ou ses propres méthodes).
     */
    async ouvreSuivi(): Promise<void> {
        await platform().inWebContext(async () => {
            await this.closeOpenNavPlusMenu()
            let suivi = await findRole('button', /Suivi/, {timeout: 10000})
            await suivi.click()
        })
    }

    /**
     * Sonde dédiée, réutilisée par NavigationPage.openPlusMenu() : le <dialog> du menu « Plus » est-il ouvert ?
     * Même sélecteur que closeOpenNavPlusMenu(), sans le clic.
     */
    async isMenuPlusVisible(): Promise<boolean> {
        return await platform().inWebContext(() =>
            driver.execute(() =>
                !!document.querySelector('dialog[id^="modal-main-nav-plus"].fr-modal--opened')
            ) as Promise<boolean>
        )
    }

    /**
     * Ferme défensivement le <dialog> natif du menu "Plus" de la nav (#modal-main-nav-plus-…)
     * s'il est déjà ouvert. Observé en webapp (Chrome desktop) juste après le login : ce dialog
     * DSFR reste en état `fr-modal--opened` sans qu'aucun clic ne l'ait ouvert et recouvre tout
     * l'écran, interceptant le clic sur "Suivi" ("element click intercepted"). Non reproduit sur
     * WebView Android/iOS — cause probable côté app non élucidée, contournement test uniquement.
     *
     * Public : réutilisée par NavigationPage.goToTab() en plus de ouvreSuivi() (le menu "Plus" est aussi le
     * menu profil/avatar). Pas de wait, idempotente. Pas d'avertissement quand elle ferme le menu : un scénario
     * peut l'avoir ouvert lui-même (NavigationPage.listPlusEntries()).
     */
    async closeOpenNavPlusMenu(): Promise<void> {
        // Clic JS sur le bouton "Fermer" du DSFR plutôt que dialog.close() : la modale est
        // pilotée par le contrôleur JS du DSFR (classe `fr-modal--opened` synchronisée sur son
        // propre état interne), pas seulement par l'attribut natif `open` du <dialog> — appeler
        // `.close()` directement laisse la classe CSS en place et le clic reste intercepté.
        await platform().inWebContext(() => driver.execute(() => {
            const dialog = document.querySelector('dialog[id^="modal-main-nav-plus"].fr-modal--opened')
            const closeBtn = dialog?.querySelector('[data-fr-js-modal-button="true"]') as HTMLElement | null
            closeBtn?.click()
        }))
    }

    /** Vérifie les blocs de l'accueil : salutation, date, « Mon agenda », « Mes démarches », cloche. */
    async assertContentVisible(): Promise<void> {
        await waitForHeading(homeContentLocators.greetingPattern)
        await waitForHeading(homeContentLocators.agendaHeading)
        await waitForHeading(homeContentLocators.proceduresHeading)
        const buttons = await visibleButtonTexts()
        if (!buttons.some(t => homeContentLocators.notificationsBellName.test(t)))
            throw new AssertionError({message: `Cloche de notifications absente de l'accueil (boutons visibles : ${buttons.join(' | ')})`})
    }

    /** Texte de la salutation « Bonjour <prénom> » (titre <h1> de l'accueil). */
    async greeting(): Promise<string> {
        return await platform().inWebContext(async () => {
            const heading = await findRole('heading', homeContentLocators.greetingPattern, {timeout: 10000})
            return (await heading.getText()).trim()
        })
    }

    /** La date du jour est affichée sous la salutation (ex. « vendredi 2 octobre 2026 »). */
    async assertDateVisible(): Promise<void> {
        const text = await pageText()
        if (!/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \p{L}+ \d{4}/u.test(text))
            throw new AssertionError({message: `Date du jour absente de l'accueil (texte : ${text.slice(0, 200)})`})
    }

    /** Ouvre l'inbox via la cloche de l'accueil. */
    async openNotificationsBell(): Promise<void> {
        await clickButton(homeContentLocators.notificationsBellName)
    }

    async openAllEvents(): Promise<void> {
        await clickButton(homeContentLocators.seeAllEventsName)
    }

    async openAllProcedures(): Promise<void> {
        await clickButton(homeContentLocators.seeAllProceduresName)
    }

    /**
     * Ouvre la fiche du service « Opération Tranquillité Vacances » depuis le carrousel (Splide) :
     * une seule carte est accessible à la fois (les autres sont aria-hidden, hors écran) — on avance
     * avec « Diapositive suivante » jusqu'à ce que la carte soit atteignable.
     */
    async openOtvCard(): Promise<void> {
        await platform().inWebContext(async () => {
            for (let slide = 0; slide < 4; slide++) {
                const card = await queryRole('button', homeContentLocators.otvCardName)
                if (card) {
                    await card.click()
                    return
                }
                const next = await findRole('button', homeContentLocators.carouselNextName, {timeout: 5000})
                await next.click()
                // Animation du carrousel : la carte devient atteignable à la fin de la transition ; sinon on retente.
                await hasRole('button', homeContentLocators.otvCardName, 2500)
            }
            throw new AssertionError({message: `Carte "${homeContentLocators.otvCardName}" jamais atteignable dans le carrousel`})
        })
    }

    /** Ouvre le formulaire d'adresse depuis la carte « Renseignez votre adresse » du carrousel (1re diapositive). */
    async openAddressCard(): Promise<void> {
        await clickButton(homeContentLocators.addressCardName)
    }

}

export default traced(new HomePage(), 'HomePage')
