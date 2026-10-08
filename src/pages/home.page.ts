import {getHomeLocators, homeContentLocators} from './locators/home.locators'
import {navigationLocators} from './locators/navigation.locators'
import {describeCurrentPage} from '../helpers/webview';
import {clickButton, visibleButtonTexts, waitForHeading, pageText, findRole, queryRole} from '../helpers/spa'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import OnboardingZonesPage from './onboarding-zones.page'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

class HomePage {
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
     * seul le header de la home l'affiche (titre <h1> « Bonjour <prénom> ») ; les 5 boutons de la barre de nav
     * (Accueil, Agenda, Services, Suivi, Plus) sont affichés ensemble sur tous les écrans, donc ne discriminent
     * pas Home à eux seuls.
     * recherche par texte affiché (innerText, respecte la visibilité) plutôt que par structure DOM.
     *
     * Échec dur (throw) plutôt que booléen : centralise le diagnostic (describeCurrentPage())
     * pour ses 3 appelants (goToHomeFromAnywhere, authenticate.process.ts, authentication.test.ts)
     * au lieu de le dupliquer à chaque site d'appel.
     */
    async assertHomeVisible(timeout = 30000): Promise<void> {
        // La page d'accueil est une webview
        if (await platform().isWebContextAvailable()) {
            // Première connexion du compte : la SPA affiche d'abord /welcome/zones (puis l'onboarding des
            // notifications, traité juste après) avant la home.
            if (await OnboardingZonesPage.isVisible(1000)) {
                await OnboardingZonesPage.dismiss()
            }

            // L'écran d'onboarding peut apparaître, et doit être refusé (ça évite les pop-in natives de notification qui pourraient intercepter les clics).
            if (await OnboardingNotificationsPage.isOnboardingVisible()) {
                await OnboardingNotificationsPage.dismiss()
                if (await this.probeWelcomeText(5000)) return
            }

            // Le menu plus reste parfois ouvert même après une reconnexion, au cas où, on le referme
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
    async isHomeDisplayed(timeout: number): Promise<boolean> {
        return await this.probeWelcomeText(timeout)
    }

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
        } catch (ex) {
            // Cas attendu : la salutation n'apparaît pas dans le délai (timeout du waitUntil) — l'appelant
            // poursuit sa cascade de récupération. Un autre type d'erreur reste visible dans ce log.
            log.warn(`probeWelcomeText: salutation non trouvée sous ${timeout}ms`, ex)
            return false
        }
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
        ).catch((ex) => {
            log.warn('isMenuPlusVisible: sonde du menu « Plus » en échec, considéré comme fermé', ex)
            return false
        })
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
     *   3. Sentinel : `assertHomeVisible()` (salutation « Bonjour »).
     *
     * Ne sert qu'à revenir à l'accueil en cours de scénario. Le reset de début de test (session, page hors
     * SPA, onboarding) est `getAppToStartingState()`.
     */
    async goToHomeFromAnywhere(timeout: number): Promise<void> {
        await platform().inWebContext(async () => {
            // Webapp : clic sur le bouton « Accueil » de la barre basse (vrai geste utilisateur). Le hash seul
            // n'aboutit pas quand la page quittée est encore en cours de montage (observé le 2026-10-07 :
            // retour à l'accueil depuis l'agenda 20 ms après l'apparition de son titre).
            // Mobile : hash uniquement, comme avant (clic sur la barre basse non validé sur mobile : l'iOS
            // du 2026-10-07 était instable, y compris sur le commit précédent — à réévaluer).
            let clicked = false
            if (platform().kind === 'webapp') {
                // Le menu « Plus » peut rester ouvert et intercepter le clic (cf. closeOpenNavPlusMenu()).
                await this.closeOpenNavPlusMenu()
                clicked = await this.clickBottomBarButton('Accueil').catch((ex) => {
                    log.warn('goToHomeFromAnywhere: clic sur « Accueil » en échec, repli sur le hash', ex)
                    return false
                })
            }
            if (!clicked) {
                // driver.execute : aucun bouton ne mène à la home depuis une page sans barre basse (ou sur
                // mobile) — les primitives de spa.ts ne suffisent pas, navigation directe par hash.
                await driver.execute(() => {
                    window.location.hash = '/'
                })
            }
        })
        // Comme on part de n'importe où, on ne peut pas détecter qu'on a quitté la page précédente.
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
                await browser.waitUntil(
                    async () => !!await queryRole('button', homeContentLocators.otvCardName),
                    {timeout: 2500, interval: 250, timeoutMsg: `Carte "${homeContentLocators.otvCardName}" pas encore atteignable après « Diapositive suivante »`}
                ).catch((ex) => {
                    // animation du carrousel : on retente au tour suivant
                    log.debug(`openOtvCard: carte pas encore atteignable (diapositive ${slide + 1}), on retente`, ex)
                })
            }
            throw new AssertionError({message: `Carte "${homeContentLocators.otvCardName}" jamais atteignable dans le carrousel`})
        })
    }

    /** Ouvre le formulaire d'adresse depuis la carte « Renseignez votre adresse » du carrousel (1re diapositive). */
    async openAddressCard(): Promise<void> {
        await clickButton(homeContentLocators.addressCardName)
    }

    /**
     * Clique un bouton de la barre de navigation basse (`nav` « Menu principal ») — le vrai geste
     * utilisateur, qui passe par le routeur de la SPA. La SPA n'a aucun `<a>` interne (tout est
     * `<button>`) : l'ancienne recherche d'un lien « Accueil » ne trouvait jamais rien et retombait
     * toujours sur le hash, qui n'aboutit pas quand la page quittée est encore en cours de montage
     * (observé le 2026-10-07 : retour à l'accueil depuis l'agenda 20 ms après l'apparition de son titre).
     * Retourne false si la barre est absente (page enfant sans nav basse) : l'appelant choisit le repli.
     */
    private async clickBottomBarButton(name: string): Promise<boolean> {
        const button = await queryRole('button', name, {in: {role: 'navigation', name: navigationLocators.bottomBarName}}).catch((ex) => {
            log.warn(`clickBottomBarButton: recherche du bouton « ${name} » en échec`, ex)
            return null
        })
        if (!button) return false
        await button.click()
        return true
    }

}

export default traced(new HomePage(), 'HomePage')
