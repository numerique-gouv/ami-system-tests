import {tl} from '../helpers/webview'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

class NotificationsInboxPage {

    /**
     * Sentinelle de rendu de la page inbox — driver.execute (pas tl()) car une navigation peut
     * être en cours (executeAsync serait tué, cf. CONTRIBUTING.md §2). Le heading "Notifications"
     * confirme le rendu réel de la page, pas juste le changement d'URL (le hash peut être mis à
     * jour avant que le contenu soit rendu, cf. CONTRIBUTING.md §4). Appeler avant tout tl() dans
     * cette classe évite de faire courir l'injection de Testing Library (3 commandes WebDriver
     * distinctes côté @testing-library/webdriverio) contre une navigation ou un reload en cours,
     * ce qui laisserait window.TestingLibraryDom indéfini entre son injection et son .configure().
     */
    private async waitForNotificationsHeading(timeout = 15000): Promise<void> {
        await browser.waitUntil(
            async () => driver.execute(() =>
                Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]'))
                    .some(h => h.innerText?.trim() === 'Notifications')
            ) as Promise<boolean>,
            {timeout, interval: 500, timeoutMsg: 'Heading "Notifications" absent'}
        )
    }

    /**
     * Ouvre l'inbox en tapant l'icône cloche dans la WebView SPA,
     * puis attend que le hash d'URL /#/notifications soit atteint.
     * Pré-condition : l'onboarding notifications a déjà été refusé.
     */
    async openFromHome(): Promise<void> {
        await platform().inWebContext(async () => {
            // getByRole('button') cible la cloche par son rôle ARIA et son nom accessible —
            // plus robuste que le sélecteur CSS structurel '#notification-icon button'.
            const bell = await tl().getByRole('button', {name: /notifications/i})
            await bell.waitForDisplayed({timeout: 15000})
            await bell.click()
        })
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
    async assertNotificationReceived(title: string, timeoutMs = 25000): Promise<boolean> {
        return platform().inWebContext(async () => {
            const found = await browser.waitUntil(
                async () => driver.execute(
                    (text) => Array.from(document.querySelectorAll<HTMLElement>('*'))
                        .some(el => el.children.length === 0 && el.textContent?.trim() === text),
                    title
                ) as unknown as boolean,
                {timeout: timeoutMs, interval: 2000, timeoutMsg: `Notification not received:${title}.`}
            ).catch(() => false)
            if (found) {
                log.log(`[notifications] reçue (WebSocket, ≤ ${timeoutMs}ms)`)
                return found
            }

            // Contournement iOS uniquement (cf. docs/process/2026-09-08-notifications-websocket-android-ios.md) :
            // WKWebView peut laisser le WebSocket "zombie" (pas d'event close/error après un retour
            // d'arrière-plan), donc `found` peut être faux même si la notification existe déjà côté
            // serveur — un reload contourne le socket mort en forçant un fetch frais. À retirer une
            // fois le heartbeat proposé dans ce document implémenté côté SPA. Sur Android, la liste se
            // met déjà à jour en place via le WebSocket (vérifié le 2026-09-08) : un reload n'y
            // apporterait qu'un délai supplémentaire, donc on échoue directement.
            if (!driver.isIOS) {
                throw new AssertionError({ message: `Notification not received:${title}.` })
            }

            await driver.execute(() => window.location.reload())
            await browser.waitUntil(
                () => driver.execute(() => document.body.innerText.trim().length > 0) as Promise<boolean>,
                {timeout: 8000, interval: 200}
            ).catch(() => {})
            const foundAfterReload = await driver.execute(
                (text) => Array.from(document.querySelectorAll<HTMLElement>('*'))
                    .some(el => el.children.length === 0 && el.textContent?.trim() === text),
                title
            ) as unknown as boolean
            if (foundAfterReload) {
                log.log(`[notifications] reçue après reload (iOS, socket zombie contourné, ≤ ${timeoutMs}ms)`)
                return true
            }
            throw new AssertionError({ message: `Notification not received:${title}. (iOS, même après reload)` })
        })
    }

    /**
     * Clique sur la notification dont le texte visible correspond exactement à `title`,
     * puis attend que le routeur Svelte navigue vers la page de détail (changement de hash).
     * Pré-condition : la notification est déjà visible dans l'inbox (utiliser waitForNotification avant).
     *
     * driver.execute plutôt que tl() : le reload forcé par assertNotificationReceived pour obtenir
     * la notification fraîche laisse souvent la page encore en cours de (re)construction à ce stade
     * (WKWebView sur iOS notamment) — le heading peut déjà être visible alors que le document est
     * encore en train d'être remplacé. tl() a tendance à planter dans ce contexte : son injection
     * de Testing Library tient en 3 aller-retours WebDriver non atomiques (vérifier présence,
     * injecter le script, appeler .configure()), et une navigation qui se termine entre ces 3
     * étapes vide window.TestingLibraryDom avant que .configure() ne s'exécute
     * ("window.TestingLibraryDom.configure" undefined). driver.execute trouve et clique l'élément
     * en un seul aller-retour synchrone, sans cette fenêtre de course.
     */
    async clickNotification(title: string): Promise<void> {
        await platform().inWebContext(async () => {
            await this.waitForNotificationsHeading()
            const clicked = await driver.execute((text: string) => {
                const el = Array.from(document.querySelectorAll<HTMLElement>('*'))
                    .find((e) => e.children.length === 0 && e.textContent?.trim() === text)
                const clickable = (el?.closest('a, button') as HTMLElement | null) ?? el
                clickable?.click()
                return !!clickable
            }, title) as boolean
            if (!clicked) {
                throw new AssertionError({ message: `Notification "${title}" introuvable pour le clic` })
            }
        })
    }

    /**
     * Retourne le texte du premier heading visible sur la page de détail d'une notification.
     * Utilise driver.execute plutôt que $$()/.getText() : la page notifications reçoit des
     * mises à jour WebSocket en continu (cf. waitForNotification) — un $$() suivi de .getText()
     * par élément laisse une fenêtre entre la capture de la liste et sa lecture, pendant laquelle
     * le DOM peut se re-rendre et invalider les handles ("stale element", cf. CONTRIBUTING.md §2
     * pour le cas général où driver.execute reste préférable).
     * driver.execute lit tout dans le même instantané JS synchrone, pas de fenêtre de staleness.
     * Utilise driver.execute plutôt que getByRole({ level: 1 }) également car la SPA AMI utilise
     * <h2> / <h3> (composants DSFR fr-tile) et non systématiquement <h1>.
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
