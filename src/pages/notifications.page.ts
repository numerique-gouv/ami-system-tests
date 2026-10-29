import {traced} from '../helpers/reporting/traced'
import {clickDisplayed, firstDisplayed, hasPageText, reloadPage, waitForHeading} from '../helpers/spa/spa'
import {homeContentLocators} from './locators/home.locators'
import {notificationsLocators} from './locators/notifications.locators'
import {AssertionError} from "node:assert";

class NotificationsInboxPage {
    /**
     * Vérifie le titre ET la liste initiale rendue (au moins une notification, le compte de test a toujours « Bienvenue sur AMI ») :
     * la SPA ne s'abonne à son WebSocket qu'après le chargement de la liste, une notification publiée avant est perdue.
     */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(notificationsLocators.pageTitle, 15000)
        await firstDisplayed(notificationsLocators.notificationItem, {timeout: 15000})
    }

    /** Ouvre l'inbox par l'icône cloche. Pré-condition : l'onboarding notifications est refusé. */
    async openFromHome(): Promise<void> {
        await clickDisplayed(homeContentLocators.notificationsBell, {timeout: 15000})
    }

    /**
     * Attend une notification de ce titre exact. La liste se met à jour en place par le WebSocket de la page : pas de reload, qui le fermerait.
     * iOS seulement : le WebSocket peut rester « zombie » après un retour d'arrière-plan (WKWebView), un reload force alors un fetch frais.
     */
    async assertNotificationReceived(title: string, timeoutMs = 25000): Promise<void> {
        if (await hasPageText(title, timeoutMs)) return
        if (!driver.isIOS) {
            throw new AssertionError({ message: `Notification not received:${title}.` })
        }
        await reloadPage()
        if (await hasPageText(title, 8000)) return
        throw new AssertionError({ message: `Notification not received:${title}. (iOS, même après reload)` })
    }

    /** Une notification de ce titre est-elle listée sous `timeout` ms ? (absence : attend le délai en entier) */
    async isNotificationListed(title: string, timeout = 0): Promise<boolean> {
        return await hasPageText(title, timeout)
    }

    /** Pré-condition : la notification est visible (`assertNotificationReceived`). L'arrivée est vérifiée par la page cible. */
    async clickNotification(title: string): Promise<void> {
        await clickDisplayed(notificationsLocators.notificationTitle(title), {timeout: 10000})
    }

    /**
     * Texte du premier titre de la page de détail d'une notification, ou '' si absent. Lu dans un seul `execute` : la page reçoit des mises à jour
     * WebSocket continues, `$$()` puis `getText()` par élément laisserait le DOM se re-rendre entre les deux (« stale element »).
     * Le titre est un lien (fr-tile DSFR), pas un heading : les liens de navigation sont exclus.
     */
    async getTopNotificationTitle(): Promise<string> {
        return await driver.execute(() => {
            const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
            const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]')).find(
                (e) => !EXCLUDED.has((e.textContent ?? '').replace(/\s+/g, ' ').trim())
            )
            return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
        }) as string
    }
}

export default traced(new NotificationsInboxPage(), 'NotificationsInboxPage')
