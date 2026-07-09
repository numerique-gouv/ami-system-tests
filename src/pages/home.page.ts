import {getHomeLocators} from './locators/home.locators'
import {withWebView} from '../helpers/webview';
import { traced } from '../helpers/traced'

class HomePage {
    /**
     * Guard d'authentification : navigue vers la home puis attend le sentinel.
     * Le if/else branche sur le contexte courant — ajouter une branche si la home
     * passe en natif sans remplacer le WebView (app hybride multi-écrans).
     *
     * Utilisé dans les before() pour détecter si la session est déjà authentifiée,
     * quelle que soit la page sur laquelle le test précédent s'est terminé.
     */
    async isHomeReachable(timeout = 5000): Promise<boolean> {
        const contexts = await driver.getContexts() as string[]
        if (contexts.some(c => c.startsWith('WEBVIEW_'))) {
            try {
                await this.navigateHomeFromWebview(timeout)
            } catch (ex) {
                console.warn('isHomeReachable: navigation vers la home en échec', ex)
                return false
            }
            return true
        }
        // TODO en navigation native, fait des back()k,blkdnfbdddbdbgd.
        return false
    }

    /**
     * Navigation vers la home depuis un contexte WebView.
     *
     * Pattern CONTRIBUTING.md §4 (WebView et contextes) — navigation + sentinel dans le même withWebView() :
     * sortir du contexte pendant la transition SPA laisse WKWebView dans un état instable
     * sur iOS (AX tree corrompu, outils WDIO aveugles). On reste dans le contexte jusqu'à
     * ce que le DOM de destination soit stable.
     *
     * Stratégie :
     *   1. Déjà sur #/ → rien à faire.
     *   2. Sinon, clic sur le lien "Accueil" s'il est visible (préféré : déclenche les gardes Svelte).
     *   3. Fallback hash si aucun lien de nav présent (état de départ inconnu).
     *   4. Sentinel : lien "Suivi" visible → DOM home stable.
     */
    private async navigateHomeFromWebview(timeout: number): Promise<void> {
        await withWebView(async () => {
            const alreadyHome = await driver.execute(
                () => window.location.hash === '#/'
            ) as boolean

            if (!alreadyHome) {
                const clicked = await this.clickLinkByText('Accueil')

                if (!clicked) {
                    await driver.execute(() => { window.location.hash = '/' })
                }
            }

            await browser.waitUntil(
                async () => driver.execute(() =>
                    Array.from(document.querySelectorAll('a'))
                        .some(a => (a as HTMLElement).innerText?.trim() === 'Suivi')
                ) as Promise<boolean>,
                { timeout, interval: 500, timeoutMsg: 'Home non atteinte — lien "Suivi" absent après navigation' }
            )
        })
    }

    /**
     * Clique un lien <a> par son texte visible. driver.execute (find + click atomique en un
     * seul appel JS) plutôt que tl()/$$() : ces deux derniers résolvent l'élément dans un appel
     * puis cliquent dans un second — si la SPA se re-rend entre les deux (cas réel constaté dans
     * ouvreSuivi(), appelé dans une boucle waitUntil pendant une navigation potentiellement
     * active), le handle devient stale ("Request encountered a stale element"). driver.execute
     * élimine cette fenêtre.
     * Retourne false si le lien n'existe pas (l'appelant décide du fallback).
     */
    private async clickLinkByText(text: string): Promise<boolean> {
        return await driver.execute((t: string) => {
            const link = Array.from(document.querySelectorAll('a'))
                .find(a => (a as HTMLElement).innerText?.trim() === t) as HTMLElement | undefined
            if (!link) return false
            link.click()
            return true
        }, text) as boolean
    }

    /**
     * Attend que le conteneur WebView natif soit visible.
     * L'app AMI est 100% SPA — pas de resource-id natif, on détecte la WebView elle-même.
     */
    async waitForVisible(timeout = 30000): Promise<void> {
        const {width, height} = await driver.getWindowSize()
        await driver.action('pointer', {parameters: {pointerType: 'touch'}})
            .move({duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.4)})
            .down({button: 0})
            .move({duration: 300, x: Math.round(width / 2), y: Math.round(height * 0.5)})
            .up({button: 0})
            .perform()
        const loc = getHomeLocators()
        await $(loc.screenRoot).waitForDisplayed({timeout})
    }

    /**
     * Attend que la SPA home authentifiée soit chargée.
     * Utilise driver.execute (JS sync) pour détecter le lien "Suivi" visible dans la nav.
     * Les async scripts (tl().findByRole) sont tués lors de la navigation post-OIDC,
     * d'où l'usage du JS synchrone qui retourne immédiatement lors d'une navigation.
     */
    async isHomeVisible(timeout = 30000): Promise<boolean> {
        try {
            await this.waitForVisible(timeout)
            return await withWebView(async () => {
                await browser.waitUntil(
                    async () => {
                        try {
                            return await driver.execute(() =>
                                Array.from(document.querySelectorAll('a'))
                                    .some(a => a.innerText?.trim() === 'Suivi')
                            ) as boolean
                        } catch {
                            return false
                        }
                    },
                    {timeout, interval: 1000, timeoutMsg: `SPA home non prête — lien "Suivi" absent après ${timeout}ms`}
                )
                return true
            })
        } catch (ex) {
            console.warn('isHomeVisible: home non atteinte', ex)
            return false
        }
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le lien visible dans la nav.
     * Attend que le titre "Mes démarches" soit visible pour confirmer la navigation.
     */
    async ouvreSuivi(): Promise<void> {
        await withWebView(async () => {
            // Retry pendant potentiellement une navigation active — clickLinkByText() est
            // atomique (driver.execute), donc utilisable ici sans risque d'élément stale
            // ni d'executeAsync tué par une navigation en cours.
            await browser.waitUntil(
                async () => this.clickLinkByText('Suivi'),
                {timeout: 10000, interval: 500, timeoutMsg: 'Lien "Suivi" introuvable dans la nav'}
            )
            await browser.waitUntil(
                async () => await driver.execute(() =>
                    Array.from(document.querySelectorAll<HTMLElement>('h1, h2')).some(h => h.innerText?.includes('démarches'))
                ) as boolean,
                {
                    timeout: 10000,
                    interval: 300,
                    timeoutMsg: 'Heading "Mes démarches" absent après navigation vers Suivi'
                }
            )
        })
    }

}

export default traced(new HomePage(), 'HomePage')
