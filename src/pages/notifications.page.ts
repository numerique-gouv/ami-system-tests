import {platform} from '../platform'
import {traced} from '../helpers/traced'
import logger from "@wdio/logger";
import {clickDisplayed, firstDisplayed, hasPageText, waitForHeading} from '../helpers/spa'
import {homeContentLocators} from './locators/home.locators'
import {notificationsLocators} from './locators/notifications.locators'
import {AssertionError} from "node:assert";

const log = logger('page-object')

class NotificationsInboxPage {

    /**
     * Attend le heading « Notifications » (titre de la page inbox). Le titre confirme le rendu réel de la page, pas seulement l'URL.
     */
    private async waitForNotificationsHeading(timeout = 15000): Promise<void> {
        await waitForHeading(notificationsLocators.pageTitle, timeout)
    }

    /**
     * Vérifie l'arrivée sur l'inbox : le titre ET la liste initiale rendue (au moins une notification,
     * chacune étant un `<h3>`). À appeler avant de publier une notification : la SPA ne s'abonne à son
     * WebSocket qu'après `buildFollowup()` puis `retrieveNotifications()` (`onMount` de
     * `routes/notifications/+page.svelte`), alors que le titre est affiché bien avant. Une notification
     * publiée entre-temps est perdue (observé le 2026-10-07 : webapp et iOS). Le compte de test a
     * toujours au moins la notification d'accueil « Bienvenue sur AMI ».
     */
    async assertDisplayed(): Promise<void> {
        await platform().inWebContext(async () => {
            await this.waitForNotificationsHeading()
            await firstDisplayed(notificationsLocators.notificationItem, {timeout: 15000})
        })
    }

    /**
     * Ouvre l'inbox en tapant l'icône cloche dans la WebView SPA. La page d'origine ne connaît pas
     * l'inbox : l'arrivée est vérifiée par `assertDisplayed()`.
     * Pré-condition : l'onboarding notifications a déjà été refusé.
     */
    async openFromHome(): Promise<void> {
        await clickDisplayed(homeContentLocators.notificationsBell, {timeout: 15000})
    }
    /**
     * « Gérer » (en-tête de l'inbox) ouvre les préférences de notifications. Texte visible « Gérer »,
     * mais nom accessible = aria-label « Gérer les notifications » (vérifié en live le 2026-10-02).
     */
    async openManage(): Promise<void> {
        await clickDisplayed(notificationsLocators.manageButton)
    }

    /**
     * Attend qu'un item avec ce titre exact apparaisse dans l'inbox.
     *
     * La page `/#/notifications` de la SPA ouvre son propre WebSocket
     * (`notificationEventsSocket` dans `src/routes/notifications/+page.svelte` côté
     * `ami-notifications-api/public/mobile-app`) dont le handler `onmessage` refait
     * `retrieveNotifications()` et réassigne la liste réactive Svelte — la liste se met donc
     * à jour EN PLACE sans reload ni navigation, tant que la page reste montée. Un
     * `window.location.reload()` ici serait contre-productif : il fermerait ce WebSocket et
     * forcerait une reconnexion, ralentissant l'arrivée qu'on cherche justement à observer
     * (vérifié en direct le 2026-09-08 : le mécanisme reload+poll précédent datait d'une
     * période où la livraison WebSocket n'était pas fiable ; ce n'est plus le cas).
     *
     * Un seul `inWebContext`, un seul `waitUntil` qui relit le DOM en direct — pas de
     * `browser.pause` d'attente entre tentatives, pas de reload.
     */
    async assertNotificationReceived(title: string, timeoutMs = 25000): Promise<void> {
        await platform().inWebContext(async () => {
            if (await hasPageText(title, timeoutMs)) {
                log.log(`[notifications] reçue (WebSocket, ≤ ${timeoutMs}ms)`)
                return
            }

            // Contournement iOS uniquement (cf. docs/process/2026-09-08-notifications-websocket-android-ios.md) :
            // WKWebView peut laisser le WebSocket "zombie" (pas d'event close/error après un retour
            // d'arrière-plan), donc la notification peut être absente alors qu'elle existe déjà côté
            // serveur — un reload contourne le socket mort en forçant un fetch frais. À retirer une
            // fois le heartbeat proposé dans ce document implémenté côté SPA. Sur Android, la liste se
            // met déjà à jour en place via le WebSocket (vérifié le 2026-09-08) : un reload n'y
            // apporterait qu'un délai supplémentaire, donc on échoue directement.
            if (!driver.isIOS) {
                throw new AssertionError({ message: `Notification not received:${title}.` })
            }

            log.warn('ANOMALIE (iOS) : notification non reçue par le WebSocket, rechargement de la page — ' +
                'socket probablement zombie, non confirmé.')
            await driver.execute(() => window.location.reload())
            // hasPageText attend le rendu de la page rechargée (il réessaie jusqu'à trouver le texte).
            if (await hasPageText(title, 8000)) {
                log.warn('ANOMALIE (iOS) : notification reçue seulement après reload, WebSocket probablement zombie — non confirmé.')
                return
            }
            throw new AssertionError({ message: `Notification not received:${title}. (iOS, même après reload)` })
        })
    }

    /**
     * Clique sur la notification dont le texte visible correspond exactement à `title`.
     * Ne vérifie pas la page de destination : l'arrivée est vérifiée par la page cible.
     * Pré-condition : la notification est déjà visible dans l'inbox (utiliser assertNotificationReceived avant).
     */
    async clickNotification(title: string): Promise<void> {
        await platform().inWebContext(async () => {
            await clickDisplayed(notificationsLocators.notificationTitle(title), {timeout: 10000})
        })
    }

    /**
     * Retourne le texte du premier heading visible sur la page de détail d'une notification.
     * Utilise driver.execute plutôt que $$()/.getText() : la page notifications reçoit des
     * mises à jour WebSocket en continu (cf. assertNotificationReceived) — un $$() suivi de .getText()
     * par élément laisse une fenêtre entre la capture de la liste et sa lecture, pendant laquelle
     * le DOM peut se re-rendre et invalider les handles ("stale element", cf. CONTRIBUTING.md §2
     * pour le cas général où driver.execute reste préférable).
     * driver.execute lit tout dans le même instantané JS synchrone, pas de fenêtre de staleness.
     * Utilise driver.execute plutôt qu'un sélecteur `role/heading` également car le titre d'une
     * notification n'est pas un heading de niveau fixe : c'est un lien (composant DSFR fr-tile).
     */
    async getTopNotificationTitle(): Promise<string> {
        return platform().inWebContext(async () => {
            const text = await driver.execute(() => {
                // Le titre de la notification est rendu comme un <a> (composant fr-tile DSFR), pas un heading.
                // On exclut les liens de navigation pour ne garder que le titre métier.
                const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
                const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]')).find(
                    (e) => !EXCLUDED.has((e.textContent ?? '').replace(/\s+/g, ' ').trim())
                )
                return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
            }) as string
            // Retourne '' sur inbox vide (pas de notification antérieure) — le test gère ce cas
            // via l'assertion expect(oldTop).not.toEqual(title). Sur la page de détail après clic,
            // '' provoque un échec à l'assertion expect(newTop).toEqual(title), ce qui est correct.
            return text
        })
    }
}

export default traced(new NotificationsInboxPage(), 'NotificationsInboxPage')
