import {getHomeLocators, homeContentLocators} from './locators/home.locators'
import {tl, describeCurrentPage} from '../helpers/webview';
import {clickButton, visibleButtonTexts, waitForHeading, pageText} from '../helpers/spa'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import OnboardingZonesPage from './onboarding-zones.page'
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
     * seul le header de la home l'affiche (titre <h1> « Bonjour <prénom> ») ; les 3 boutons de nav (Accueil, Agenda, Suivi) sont
     * affichés ensemble sur tous les écrans, donc ne discriminent pas Home à eux seuls.
     * recherche par texte affiché (innerText, respecte la visibilité) plutôt que par structure DOM.
     *
     * Échec dur (throw) plutôt que booléen : centralise le diagnostic (describeCurrentPage())
     * pour ses 3 appelants (goToHomeFromAnywhere, authenticate.process.ts, authentication.test.ts)
     * au lieu de le dupliquer à chaque site d'appel.
     */
    async assertHomeVisible(timeout = 30000): Promise<void> {
        // La page d'accueil est une webview'
        if (await platform().isWebContextAvailable()) {
            // Première connexion du compte : la SPA affiche d'abord /welcome/zones (puis l'onboarding des
            // notifications, traité juste après) avant la home.
            if (await OnboardingZonesPage.isVisible(1000)) {
                await OnboardingZonesPage.dismiss()
            }

            // L'écran d'onboarding peut apparaitre, et doit être refusé (ca évite les pop-in native de notification qui pourraient intercépter les clicks).
            if (await OnboardingNotificationsPage.isOnboardingVisible()) {
                await OnboardingNotificationsPage.dismiss()
                if (await this.probeWelcomeText(5000)) return
            }

            // Le menu plus reste parfois ouvert même après un reconnexion, au cas où, on le referme
            if (await this.isMenuPlusVisible()) {
                await platform().inWebContext(() => this.closeOpenNavPlusMenu())
                if (await this.probeWelcomeText(5000)) return
            }

            // Ni onboarding ni menu "Plus" : la route seule ne suffit pas à confirmer la home
            // authentifiée (la page "not connected" — écran de login FranceConnect — partage la
            // même route). Seule la salutation "Bonjour" distingue les deux.
            if (await this.probeWelcomeText(timeout)) return
        }

        const where = await describeCurrentPage()
        throw new AssertionError({message: `assertHomeVisible: Home non atteinte (${where})`})
    }

    /**
     * Sonde le texte de salutation, sans cascade de récupération — extrait de l'ancien corps
     * de assertHomeVisible(), réutilisé à la fois comme premier essai et comme re-vérification
     * après chaque étape de la cascade.
     */
    private async probeWelcomeText(timeout: number): Promise<boolean> {
        try {
            return await platform().inWebContext(async () => {
                await browser.waitUntil(
                    async () => driver.execute(() =>
                        // <h1> depuis la SPA du 2026-10-02 (était <p>) : on tolère les deux, les builds
                        // mobiles embarquent une version de la SPA qui peut être plus ancienne.
                        Array.from(document.querySelectorAll('h1, p'))
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
            let suivi = await tl().findByRole('button', {name: /Suivi/}, {timeout: 10000})
            await suivi.click()
        })
    }

    /**
     * Sonde dédiée, réutilisée par assertHomeVisible() (détection d'écran) pour décider si
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
     * Public : réutilisée par assertHomeVisible() (le menu "Plus" est aussi le menu profil/avatar,
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
        // donc on attend l'arrivée sur la page cible — assertHomeVisible() lève elle-même
        // l'erreur (avec describeCurrentPage()) en cas d'échec.
        await this.assertHomeVisible(timeout)
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
            const heading = await tl().findByRole('heading', {name: homeContentLocators.greetingPattern}, {timeout: 10000})
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
                const card = await tl().queryByRole('button', {name: homeContentLocators.otvCardName})
                if (card) {
                    await card.click()
                    return
                }
                const next = await tl().findByRole('button', {name: homeContentLocators.carouselNextName}, {timeout: 5000})
                await next.click()
                await browser.waitUntil(
                    async () => !!await tl().queryByRole('button', {name: homeContentLocators.otvCardName}),
                    {timeout: 2500, interval: 250}
                ).catch(() => undefined) // animation du carrousel : on retente au tour suivant
            }
            throw new AssertionError({message: `Carte "${homeContentLocators.otvCardName}" jamais atteignable dans le carrousel`})
        })
    }

    /** Ouvre le formulaire d'adresse depuis la carte « Renseignez votre adresse » du carrousel (1re diapositive). */
    async openAddressCard(): Promise<void> {
        await clickButton(homeContentLocators.addressCardName)
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
