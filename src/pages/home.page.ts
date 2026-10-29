import {homeContentLocators} from './locators/home.locators'
import {currentUrlForLog} from '../helpers/common/session'
import {clickDisplayed, firstDisplayed, isShown, pageText} from '../helpers/spa/spa'
import {traced} from '../helpers/reporting/traced'
import NavigationPage from './navigation.page'
import {AssertionError} from "node:assert";

class HomePage {
    /** Échec dur avec l'URL courante. N'en ferme aucun écran de blocage (onboardings, menu « Plus ») : c'est le rôle du scénario. */
    async assertHomeVisible(timeout = 30000): Promise<void> {
        if (await this.isHomeDisplayed(timeout)) return
        const where = await currentUrlForLog()
        throw new AssertionError({message: `assertHomeVisible: Home non atteinte (${where})`})
    }

    /** La salutation « Bonjour <prénom> », seule affichée par l'accueil authentifié, est-elle affichée sous `timeout` ms ? */
    async isHomeDisplayed(timeout: number): Promise<boolean> {
        return await isShown(homeContentLocators.greeting, timeout)
    }

    /** L'arrivée est vérifiée par la page Suivi. */
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

    /** Le bouton « Je veux suivre mes démarches » est-il affiché sous `timeout` ms (0 : maintenant) ? */
    async isFollowButtonShown(timeout = 0): Promise<boolean> {
        return await isShown(homeContentLocators.followButton, timeout)
    }

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

    /** Avance le carrousel jusqu'à ce que la carte OTV soit atteignable : une seule carte l'est à la fois. */
    async openOtvCard(): Promise<void> {
        // Reconstruite à chaque appel : la diapositive visible change après chaque clic.
        const card = (): ReturnType<typeof $> => $(homeContentLocators.visibleSlide).$(homeContentLocators.otvCard)
        for (let slide = 0; slide < 4 && !await card().isDisplayed(); slide++) {
            const next = $(homeContentLocators.carouselNext)
            await next.waitForExist({timeout: 5000})
            await next.click()
            await card().waitForDisplayed({timeout: 2500}).catch(() => undefined)
        }
        await expect(card()).toBeDisplayed()
        await card().click()
    }

    /** Ouvre le formulaire d'adresse depuis la carte « Renseignez votre adresse » (1re diapositive). */
    async openAddressCard(): Promise<void> {
        const card = $(homeContentLocators.visibleSlide).$(homeContentLocators.addressCard)
        await card.waitForClickable()
        await card.click()
    }
}

export default traced(new HomePage(), 'HomePage')
