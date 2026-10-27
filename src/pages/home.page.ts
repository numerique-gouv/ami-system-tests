import {homeContentLocators} from './locators/home.locators'
import {describeCurrentPage} from '../helpers/spa/webview';
import {clickDisplayed, firstDisplayed, isShown, pageText} from '../helpers/spa/spa'
import {traced} from '../helpers/reporting/traced'
import NavigationPage from './navigation.page'
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
        return await isShown(homeContentLocators.greeting, timeout)
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le bouton de la nav. L'arrivée est vérifiée par
     * la page Suivi (`SuiviDemarchesPage.assertDisplayed()` ou ses propres méthodes).
     */
    async ouvreSuivi(): Promise<void> {
        await NavigationPage.goToTab('Suivi')
    }

    /** Vérifie les blocs de l'accueil : salutation, « Mon agenda », « Mes démarches », cloche. */
    async assertContentVisible(): Promise<void> {
        await expect($(homeContentLocators.greeting)).toBeDisplayed()
        await expect($(homeContentLocators.agendaHeading)).toBeDisplayed()
        await expect($(homeContentLocators.proceduresHeading)).toBeDisplayed()
        await expect($(homeContentLocators.notificationsBell)).toBeDisplayed()
    }

    /** Sonde : le bouton « Je veux suivre mes démarches » est-il affiché sur l'accueil sous `timeout` ms ? (0 : maintenant) */
    async isFollowButtonShown(timeout = 0): Promise<boolean> {
        return await isShown(homeContentLocators.followButton, timeout)
    }

    /** Texte de la salutation « Bonjour <prénom> » (titre <h1> de l'accueil). */
    async greeting(): Promise<string> {
        const heading = await firstDisplayed(homeContentLocators.greeting)
        return (await heading.getText()).trim()
    }

    /** La date du jour est affichée sous la salutation (ex. « vendredi 2 octobre 2026 »). */
    async assertDateVisible(): Promise<void> {
        const text = await pageText()
        if (!/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \p{L}+ \d{4}/u.test(text))
            throw new AssertionError({message: `Date du jour absente de l'accueil (texte : ${text.slice(0, 200)})`})
    }

    /** Ouvre l'inbox via la cloche de l'accueil. */
    async openNotificationsBell(): Promise<void> {
        await clickDisplayed(homeContentLocators.notificationsBell)
    }

    async openAllEvents(): Promise<void> {
        await clickDisplayed(homeContentLocators.seeAllEvents)
    }

    async openAllProcedures(): Promise<void> {
        await clickDisplayed(homeContentLocators.seeAllProcedures)
    }

    /**
     * Ouvre la fiche du service « Opération Tranquillité Vacances » depuis le carrousel (Splide) :
     * une seule carte est accessible à la fois (les autres sont aria-hidden, hors écran) — on avance
     * avec « Diapositive suivante » jusqu'à ce que la carte soit atteignable.
     */
    async openOtvCard(): Promise<void> {
        // Chaîne reconstruite à chaque appel : WDIO garde le parent résolu au premier usage, alors que la diapositive
        // visible change après chaque clic sur la flèche.
        const card = (): ReturnType<typeof $> => $(homeContentLocators.visibleSlide).$(homeContentLocators.otvCard)
        for (let slide = 0; slide < 4 && !await card().isDisplayed(); slide++) {
            const next = $(homeContentLocators.carouselNext)
            await next.waitForExist({timeout: 5000}) // le carrousel se monte après le rendu de la page
            await next.click()
            // Animation du carrousel : la carte devient visible à la fin de la transition. Si elle ne l'est pas, on
            // avance d'une diapositive de plus ; l'échec définitif est signalé par l'assertion ci-dessous.
            await card().waitForDisplayed({timeout: 2500}).catch(() => undefined)
        }
        await expect(card()).toBeDisplayed()
        await card().click()
    }

    /** Ouvre le formulaire d'adresse depuis la carte « Renseignez votre adresse » du carrousel (1re diapositive). */
    async openAddressCard(): Promise<void> {
        const card = $(homeContentLocators.visibleSlide).$(homeContentLocators.addressCard)
        await card.waitForClickable()
        await card.click()
    }

}

export default traced(new HomePage(), 'HomePage')
