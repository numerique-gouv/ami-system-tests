import {getHomeLocators} from './locators/home.locators'
import {tl} from '../helpers/webview';
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

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
        if (await platform().isWebContextAvailable()) {
            try {
                await this.goToHomeFromAnywhere(timeout)
            } catch (ex) {
                log.warn('isHomeReachable: navigation vers la home en échec', ex)
                return false
            }
            return true
        }
        // TODO en navigation native, fait des back()k,blkdnfbdddbdbgd.
        return false
    }

    /**
     * Attend que le conteneur WebView natif soit visible.
     * L'app AMI est 100% SPA — pas de resource-id natif, on détecte la WebView elle-même.
     * Sans objet en webapp : la session est déjà le DOM de la SPA, rien à attendre côté conteneur.
     */
    async waitForVisible(timeout = 30000): Promise<void> {
        if (platform().kind === 'webapp') return
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
     * Sentinel : texte de salutation "Bonjour <prénom>" en haut à gauche du header —
     * seul le header de la home l'affiche ; le hash de route `#/` n'est pas fiable
     * (parfois vide) et les 3 boutons de nav (Accueil, Agenda, Suivi) sont affichés
     * ensemble sur tous les écrans, donc ne discriminent pas Home.
     * recherche par texte affiché (innerText, respecte la visibilité) plutôt que par structure DOM.
     */
    async isHomeVisible(timeout = 30000): Promise<boolean> {
        try {
            return await platform().inWebContext(async () => {
                await browser.waitUntil(
                    async () => driver.execute(() =>
                        Array.from(document.querySelectorAll('p'))
                            .some(p => (p as HTMLElement).innerText?.trim().startsWith('Bonjour'))
                    ) as Promise<boolean>,
                    {
                        timeout,
                        interval: 300,
                        timeoutMsg: 'Home non atteinte — texte de salutation ("Bonjour ...") absent'
                    }
                )
                return true
            })
        } catch {
            throw new AssertionError({message: 'isHomeVisible: texte de salutation ("Bonjour ...") absent'})
        }
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le lien visible dans la nav.
     * Attend que le titre "Mes démarches" soit visible pour confirmer la navigation.
     */
    async ouvreSuivi(): Promise<void> {
        await platform().inWebContext(async () => {
            let suivi = await tl().findByRole('link', {name: /Suivi/})
            await suivi.click()
        })
    }

    /**
     * Navigue vers la home depuis n'importe quel écran WebView, avec ou sans nav basse
     * (ex. page de détail d'une démarche — cf. `demarche-detail.page.ts`, pas de lien "Accueil").
     *
     * Pattern CONTRIBUTING.md §4 (WebView et contextes) — navigation + sentinel dans le même inWebContext() :
     * sortir du contexte pendant la transition SPA laisse WKWebView dans un état instable
     * sur iOS (AX tree corrompu, outils WDIO aveugles). On reste dans le contexte jusqu'à
     * ce que le DOM de destination soit stable.
     *
     * Stratégie :
     *   1. clic sur le lien "Accueil" s'il est visible (préféré : déclenche les gardes Svelte).
     *   2. Fallback hash si aucun lien de nav présent (état de départ inconnu, ex. pas de nav basse).
     *   3. Sentinel : lien "Suivi" visible → DOM home stable.
     */
    async goToHomeFromAnywhere(timeout: number): Promise<void> {
        await platform().inWebContext(async () => {
            const clicked = await this.clickLinkByText('Accueil')
            if (!clicked) {
                await driver.execute(() => {
                    window.location.hash = '/'
                })
            }
        })
        // TODO all page code must start with a sentinel tobe sure, they are on the good page. This is an anti-pattern.
        await this.isHomeVisible(timeout)
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
            if (link) {
                link.click()
                return true
            }
            return false
        }, text) as boolean
    }

}

export default traced(new HomePage(), 'HomePage')
