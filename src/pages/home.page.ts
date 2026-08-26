import {getHomeLocators} from './locators/home.locators'
import {tl, describeCurrentPage} from '../helpers/webview';
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import OnboardingNotificationsPage from './onboarding-notifications.page'
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
        // TODO en navigation native, fait des back().
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
     * Attend que la SPA home authentifiée soit chargée, avec récupération si un écran de
     * blocage connu masque la home (onboarding notifications resté ouvert, modale du menu
     * "Plus" restée ouverte après un logout, cf. closeOpenNavPlusMenu).
     *
     * Sentinel principal : texte de salutation "Bonjour <prénom>" en haut à gauche du header —
     * seul le header de la home l'affiche ; les 3 boutons de nav (Accueil, Agenda, Suivi) sont
     * affichés ensemble sur tous les écrans, donc ne discriminent pas Home à eux seuls.
     * recherche par texte affiché (innerText, respecte la visibilité) plutôt que par structure DOM.
     *
     * Retourne un booléen réel (jamais de throw) — les appelants qui veulent un échec dur
     * (ex. goToHomeFromAnywhere, authenticate()) le font explicitement sur le retour `false`.
     */
    async isHomeVisible(timeout = 30000): Promise<boolean> {
        // La page d'accueil est une webview'
        if (!await platform().isWebContextAvailable()) return false

        // est-ce que l'on est sur l'url de la page d'accueil ?
        if (!await this.isOnHomeRoute()) return false

        // L'écran d'onboarding peut apparaitre, et doit être refusé (ca évite les pop-in native de notification qui pourraient intercépter les clicks).
        if (await OnboardingNotificationsPage.isOnboardingVisible()) {
            await OnboardingNotificationsPage.dismiss()
            if (await this.probeWelcomeText(5000)) return true
        }

        // Le menu plus reste parfois ouvert même après un reconnexion, au cas où, on le referme
        if (await this.isMenuPlusVisible()) {
            await platform().inWebContext(() => this.closeOpenNavPlusMenu())
            if (await this.probeWelcomeText(5000)) return true
        }

        return true;
    }

    /**
     * Sonde dédiée : le hash courant correspond-il à la route home (`''` ou `'#/'`) ?
     * Extrait de isHomeVisible() pour être réutilisable ailleurs dans ce fichier.
     */
    private async isOnHomeRoute(): Promise<boolean> {
        return await platform().inWebContext(() =>
            driver.execute(() => location.hash === '' || location.hash === '#/') as Promise<boolean>
        ).catch(() => false)
    }

    /**
     * Sonde le texte de salutation, sans cascade de récupération — extrait de l'ancien corps
     * de isHomeVisible(), réutilisé à la fois comme premier essai et comme re-vérification
     * après chaque étape de la cascade.
     */
    private async probeWelcomeText(timeout: number): Promise<boolean> {
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
            return false
        }
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le lien visible dans la nav.
     * Attend que le titre "Mes démarches" soit visible pour confirmer la navigation.
     */
    async ouvreSuivi(): Promise<void> {
        await platform().inWebContext(async () => {
            await this.closeOpenNavPlusMenu()
            let suivi = await tl().findByRole('button', {name: /Suivi/})
            await suivi.click()
        })
    }

    /**
     * Sonde dédiée, réutilisée par isHomeVisible() (détection d'écran) pour décider si
     * closeOpenNavPlusMenu() a réellement quelque chose à fermer. Même sélecteur que
     * closeOpenNavPlusMenu(), sans le clic.
     */
    async isMenuPlusVisible(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() =>
            driver.execute(() =>
                !!document.querySelector('dialog[id^="modal-main-nav-plus"].fr-modal--opened')
            ) as Promise<boolean>
        ).catch(() => false)
    }

    /**
     * Ferme défensivement le <dialog> natif du menu "Plus" de la nav (#modal-main-nav-plus-…)
     * s'il est déjà ouvert. Observé en webapp (Chrome desktop) juste après le login : ce dialog
     * DSFR reste en état `fr-modal--opened` sans qu'aucun clic ne l'ait ouvert et recouvre tout
     * l'écran, interceptant le clic sur "Suivi" ("element click intercepted"). Non reproduit sur
     * WebView Android/iOS — cause probable côté app non élucidée, contournement test uniquement.
     *
     * Public : réutilisée par isHomeVisible() (le menu "Plus" est aussi le menu profil/avatar,
     * cf. profile.locators.ts `toggleMenuButton`) en plus de ouvreSuivi(). Reste context-agnostic
     * (à appeler depuis un inWebContext déjà ouvert) — pas de wait, idempotente.
     */
    async closeOpenNavPlusMenu(): Promise<void> {
        // Clic JS sur le bouton "Fermer" du DSFR plutôt que dialog.close() : la modale est
        // pilotée par le contrôleur JS du DSFR (classe `fr-modal--opened` synchronisée sur son
        // propre état interne), pas seulement par l'attribut natif `open` du <dialog> — appeler
        // `.close()` directement laisse la classe CSS en place et le clic reste intercepté.
        await driver.execute(() => {
            const dialog = document.querySelector('dialog[id^="modal-main-nav-plus"].fr-modal--opened')
            const closeBtn = dialog?.querySelector('[data-fr-js-modal-button="true"]') as HTMLElement | null
            closeBtn?.click()
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
        // Comme on part de n'importe où, on ne peut pas détécter qu'on a quitté la page précédente.
        // donc on attend l'arrivée sur la page cible. isHomeVisible() ne throw plus (retourne un
        // booléen réel, cf. son commentaire) — c'est ici, à l'appelant qui veut un échec dur, de
        // lever l'erreur.
        if (!await this.isHomeVisible(timeout)) {
            const where = await describeCurrentPage()
            throw new AssertionError({message: `goToHomeFromAnywhere: Home non atteinte après navigation (${where})`})
        }
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
