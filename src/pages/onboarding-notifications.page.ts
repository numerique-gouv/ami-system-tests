import {getOnboardingNotifLocators, webOnboardingNotifLocators} from './locators/onboarding-notifications.locators'
import {platform} from '../platform'
import {traced} from '../helpers/reporting/traced'
import logger from '@wdio/logger'
import {clickDisplayed, isShown} from '../helpers/spa/spa'
import {openAppRoot} from '../helpers/common/session'
import {readNotificationAuthorization} from '../helpers/mobile/ios-notifications'

/**
 * Page Object pour l'écran d'onboarding des notifications.
 *
 * Cet écran apparaît après le premier login FC — il propose d'activer les notifications OS.
 *
 * Android : écran natif (OnboardingNotificationScreen.kt) — boutons sans resource-id stable.
 * iOS     : sheet SwiftUI (OnboardingView.swift) — sans accessibilityIdentifier.
 * Webapp  : route SPA `/#/welcome/notifications` (après OnboardingZonesPage, première connexion).
 */

const log = logger('page-object')

/** Autorisation iOS lue dans le simulateur ; `inconnue` si illisible (jamais d'exception : simple aide à la décision). */
function readAuthorizationOrUnknown(): string {
    try { return readNotificationAuthorization() } catch (err) { log.warn('autorisation des notifications illisible', err); return 'inconnue' }
}

class OnboardingNotificationsPage {
    /** Écran rendu par la SPA (route `/#/welcome/notifications`) affiché ? Faux s'il n'y a pas de WebView. */
    private async isWebVisible(timeout: number): Promise<boolean> {
        return await isShown(webOnboardingNotifLocators.heading, timeout)
    }

    /**
     * Sonde dédiée, réutilisée par HomePage.assertHomeVisible() (détection d'écran) et par
     * dismiss() elle-même (même sentinelle, un seul appel).
     *
     * Depuis la SPA d'octobre 2026, l'écran est rendu par la WebView sur Android aussi (observé
     * 2026-10-06 : au moment où il est affiché, l'arbre natif ne contient aucun texte alors que
     * l'URL de la WebView est `#/welcome/notifications`). Android passe donc par la route SPA comme
     * la webapp, avec repli sur l'écran natif (OnboardingNotificationScreen.kt) pour un ancien
     * build ; iOS reste sur la sheet SwiftUI.
     */
    async isOnboardingVisible(timeout = 5000): Promise<boolean> {
        if (platform().kind === 'webapp') return await this.isWebVisible(timeout)
        // iOS aussi : la page de la SPA (route `#/welcome/notifications`) est LA référence (le DOM est à jour). Son reflet dans l'arbre
        // natif peut être périmé (cf. refreshAxTree) : mesuré le 2026-10-27, la sonde native (« plus tard », hittable) ne la voyait pas
        // pendant 5 s alors que la WebView y était, et l'onboarding n'était alors jamais fermé (Home non atteinte).
        if (await this.isWebVisible(timeout)) return true
        if (driver.isIOS && await this.isBlankWelcomeNotificationsRoute()) return true
        const loc = getOnboardingNotifLocators()
        const nativeShown = await this.firstNative(loc.dismiss, driver.isAndroid ? 1000 : timeout) !== null
        // Android : le chemin nominal est la route SPA (observée sur l'émulateur moderne). L'écran natif
        // (OnboardingNotificationScreen.kt) est un ÉCART, à voir dans les logs ; on le traite pour que le test continue.
        if (nativeShown && driver.isAndroid) {
            log.warn('ANOMALIE (Android) : onboarding des notifications affiché en NATIF au lieu de la route SPA ' +
                '#/welcome/notifications (chemin nominal). Écart d\'appareil/WebView probable : non confirmé.')
        }
        return nativeShown
    }

    /**
     * Ferme l'onboarding en tapant « Peut-être plus tard » (no-op si l'écran est absent sous 5 s).
     * L'écran apparaît 2-4 secondes après le login OIDC — un check instantané le raterait.
     * Après cette méthode, l'OS n'a pas accordé la permission push.
     *
     * waitForExist() est préféré à waitForDisplayed() pour la détection initiale de l'écran natif :
     * sur iOS, un élément SwiftUI présent dans l'arbre XCUITest peut avoir
     * isDisplayed=false pendant l'animation d'entrée de la sheet.
     */
    async dismiss(): Promise<void> {
        // iOS : la feuille native d'abord (elle apparaît juste après la connexion), puis la route vide de la SPA (cf. leaveBlankWelcomeNotifications).
        if (driver.isIOS && await this.dismissIOS()) return
        if (!await this.isOnboardingVisible()) return
        if (platform().kind === 'webapp' || (driver.isAndroid && await this.isWebVisible(1000))) {
            await clickDisplayed(webOnboardingNotifLocators.laterButton, {timeout: 10000})
            return
        }
        // iOS : on ACTIVE les notifications (décision utilisateur 2026-10-26) : elles pourront s'afficher en bannière pendant les
        // tests, sans qu'on clique dessus. Android natif : « plus tard » pour l'instant ; point d'extension : appeler ici le helper
        // `grantPostNotifications` d'`src/helpers/mobile/android-notifications.ts` quand l'agent Android l'aura validé.
        if (driver.isIOS) await this.acceptIOS()
        else await this.dismissNative()
    }

    /**
     * iOS : traite la feuille native (permission non décidée), puis la route VIDE `#/welcome/notifications`. `true` si quelque chose a été traité.
     */
    private async dismissIOS(): Promise<boolean> {
        if (await this.isNativeSheetShown(3000)) {
            await this.activateNativeIOS()
            return true
        }
        return await this.leaveBlankWelcomeNotifications()
    }

    /**
     * iOS : la route `#/welcome/notifications` est VIDE (corps du document sans texte ni bouton), constaté le 2026-10-27 (DOM relevé en
     * test : `{"h":"#/welcome/notifications","t":"","b":[],"h1":[]}`, toujours vide 30 s plus tard). Sur iOS, c'est la feuille NATIVE qui porte
     * cet écran ; la SPA n'en rend rien. Elle ne sort de cette route que lorsque l'utilisateur répond à la feuille (« Activer » ou « Peut-être plus tard »).
     * Quand la permission est DÉJÀ décidée, l'app ne présente pas la feuille : la SPA reste vide et ne va jamais à l'accueil (impasse pour
     * l'utilisateur ; défaut app/SPA, non confirmé auprès des équipes). Seule issue côté test : recharger la racine, la SPA route alors vers l'accueil.
     * (Mesuré aussi : taper « Activer » sur la page affichée par une navigation manuelle vers cette route est sans effet quand la permission est décidée.)
     */
    private async isBlankWelcomeNotificationsRoute(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(async () => await browser.execute(
            () => location.hash.startsWith('#/welcome/notifications') && document.body.innerText.trim() === '',
        )).catch(() => false)
    }

    private async leaveBlankWelcomeNotifications(): Promise<boolean> {
        if (!await this.isBlankWelcomeNotificationsRoute()) return false
        log.warn('ANOMALIE (iOS) : la route #/welcome/notifications est vide et aucune feuille native ne la porte (permission déjà décidée) : ' +
            'la SPA n\'ira pas à l\'accueil d\'elle-même ; rechargement de la racine de l\'app.')
        await openAppRoot()
        return true
    }

    /** La feuille native « Activez les notifications » est-elle affichée (seule ou non) ? Attend `timeout` seulement si la permission n'est pas décidée. */
    private async isNativeSheetShown(timeout: number): Promise<boolean> {
        const authorization = readAuthorizationOrUnknown()
        const undecided = authorization === 'notDetermined' || authorization === 'absente'
        return await this.firstNative(getOnboardingNotifLocators().title, undecided ? timeout : 300) !== null
    }

    /**
     * iOS, page de la SPA affichée (avec ou sans la feuille native par-dessus : même effet) : on passe par le DOM, fiable, et non par
     * l'arbre natif. Sinon, feuille native seule (ex. recouvrant l'accueil) : par l'arbre natif.
     */
    private async acceptIOS(): Promise<void> {
        if (await this.isWebVisible(1000)) return await this.acceptIOSWebPage()
        await this.activateNativeIOS()
    }

    /**
     * iOS, page `#/welcome/notifications` affichée : permission non décidée → « Activer » NATIF (cf. activateNativeIOS) ; décidée →
     * « Peut-être plus tard » dans le DOM, car « Activer » est alors sans effet (mesuré 8 s : pas d'alerte, la page reste).
     */
    private async acceptIOSWebPage(): Promise<void> {
        const authorization = readAuthorizationOrUnknown()
        if (authorization === 'notDetermined' || authorization === 'absente') return await this.activateNativeIOS()
        log.info(`Permission des notifications déjà décidée (« ${authorization} ») : « Activer » est sans effet, « Peut-être plus tard »`)
        await clickDisplayed(webOnboardingNotifLocators.laterButton, {timeout: 10000})
        await this.waitForWebPageGone()
    }

    /**
     * La feuille native « Activez les notifications » est-elle affichée SEULE (la page `#/welcome/notifications` de la SPA n'est pas
     * derrière) ? Son bouton « Activer » est alors le seul de l'arbre natif : pas d'ambiguïté avec celui de la SPA (même libellé, cf. locators).
     * À traiter AVANT les pages d'onboarding de la SPA : la feuille apparaît juste après la connexion, au-dessus de la page « clé d'accès ».
     */
    async isNativeSheetAlone(timeout = 500): Promise<boolean> {
        if (!driver.isIOS) return false
        if (await this.firstNative(getOnboardingNotifLocators().title, timeout) === null) return false
        return !await this.isWebVisible(300)
    }

    /** Attend l'alerte système de notifications jusqu'à `timeout` ; l'accepte (« Autoriser ») et retourne `true`, sinon `false`. */
    private async acceptSystemAlert(timeout: number): Promise<boolean> {
        // L'alerte système (SpringBoard) est gérée par Appium : autoAcceptAlerts est faux, on l'accepte explicitement.
        let alertText = null as string | null
        await browser.waitUntil(async () => {
            try { alertText = await driver.getAlertText(); return true } catch { return false }
        }, {timeout, interval: 300}).catch(() => false)
        if (!alertText) return false
        log.info(`Alerte système de notifications : « ${String(alertText).replace(/\n/g, ' ')} », acceptation`)
        await driver.acceptAlert()
        return true
    }

    /** Après la décision : la SPA quitte `#/welcome/notifications` (accueil) et la feuille native, s'il y en avait une, se ferme. */
    private async waitForWebPageGone(): Promise<void> {
        const gone = await browser.waitUntil(async () => !await this.isWebVisible(500) && await this.isNativeOnboardingGone(), {
            timeout: 15000, interval: 300,
        }).catch(() => false)
        if (!gone) throw new Error('Onboarding des notifications toujours affiché après la décision (page de la SPA ou feuille native)')
    }

    /**
     * Traite (en ACCEPTANT, cf. dismiss) la feuille native iOS « Activez les notifications » si elle est affichée (no-op ailleurs, et si absente sous
     * `timeout`). Elle ne dépend pas de la SPA : l'app la présente à chaque événement `user_logged_in` tant que la permission
     * est `.notDetermined` et que la minuterie en mémoire a expiré, donc à chaque relancement avec session ouverte
     * (HomeView-ViewModel.swift). Elle peut recouvrir l'accueil : `isHomeDisplayed` est alors vrai alors que la WebView ne
     * répond plus. À appeler une fois l'accueil atteint.
     */
    async dismissNativeSheet(timeout = 3000): Promise<void> {
        if (!driver.isIOS) return
        const loc = getOnboardingNotifLocators()
        // Permission déjà décidée : l'app ne présente plus la feuille, inutile de l'attendre.
        const authorization = readAuthorizationOrUnknown()
        const undecided = authorization === 'notDetermined' || authorization === 'absente'
        if (await this.firstNative(loc.title, undecided ? timeout : Math.min(timeout, 500)) === null) return
        log.info('Feuille native « Activez les notifications » affichée au-dessus de l\'accueil : activation')
        await this.activateNativeIOS()
    }

    /**
     * iOS : tape « Activer » (feuille native OU page de la SPA derrière : même libellé, même effet, la SPA passe à l'accueil quand la
     * permission est décidée), puis accepte l'alerte système « souhaite vous envoyer des notifications » (bouton « Autoriser »).
     *
     * Constaté en direct (dev tools, 2026-10-27, simulateur iOS 26.5) :
     *  - permission NON décidée : « Activer » ouvre l'alerte système (~0,6 s), « Autoriser » la ferme, la feuille native disparaît et la SPA
     *    arrive sur l'accueil dans la même seconde ;
     *  - permission DÉJÀ décidée (ex. acceptée par un test précédent) : « Activer » de la page SPA ne fait RIEN (pas d'alerte, la WebView reste
     *    sur `#/welcome/notifications`, mesuré 8 s). Seul « Peut-être plus tard » ferme la page ; la permission, déjà accordée, n'est pas touchée.
     * Sans alerte, on ne retape donc « Activer » que si l'autorisation lue dans le simulateur n'est pas encore décidée ; sinon « Peut-être plus tard ».
     */
    private async activateNativeIOS(): Promise<void> {
        const loc = getOnboardingNotifLocators()
        const attempts = 3
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const activate = await this.firstNative(loc.activate as string, 5000)
            if (!activate) {
                if (await this.isNativeOnboardingGone()) return // fermée entre-temps
                throw new Error('Bouton « Activer » introuvable sur l\'onboarding des notifications')
            }
            await activate.click()
            if (await this.acceptSystemAlert(6000)) {
                const closed = await browser.waitUntil(() => this.isNativeOnboardingGone(), {timeout: 10000, interval: 300}).catch(() => false)
                if (closed) return
                throw new Error('Onboarding des notifications toujours affiché après « Activer » et l\'alerte système')
            }
            if (await this.isNativeOnboardingGone()) return // fermé sans alerte
            const authorization = readAuthorizationOrUnknown()
            if (authorization === 'notDetermined' || authorization === 'absente') {
                log.warn(`ANOMALIE : ni alerte système ni fermeture après « Activer » alors que la permission n'est pas décidée (tap ${attempt}/${attempts})`)
                continue
            }
            log.info(`« Activer » est sans effet quand la permission est déjà décidée (« ${authorization} ») : « Peut-être plus tard »`)
            return await this.dismissNative()
        }
        throw new Error('Onboarding des notifications toujours affiché après « Activer » (aucune alerte système)')
    }

    /** Ni la feuille native ni la page de la SPA (exposée dans l'arbre natif) ne montrent plus le titre de l'onboarding. */
    private async isNativeOnboardingGone(): Promise<boolean> {
        return (await $$(getOnboardingNotifLocators().title)).length === 0
    }

    private async dismissNative(): Promise<void> {
        const loc = getOnboardingNotifLocators()
        // Le tap sur « Peut-être plus tard » est parfois sans effet (feuille encore affichée 5 s après, constaté sur iOS le 2026-10-26,
        // capture à l'appui) : on retape, au plus 3 fois, avant d'échouer.
        const attempts = 3
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const dismissButton = await this.firstNative(loc.dismiss, 5000)
            if (!dismissButton) {
                if ((await $$(loc.title)).length === 0) return // fermée entre-temps
                throw new Error('Bouton « Peut-être plus tard » introuvable')
            }
            await dismissButton.click()
            const closed = await browser.waitUntil(async () => (await $$(loc.title)).length === 0, {
                timeout: 5000, interval: 300,
            }).catch(() => false)
            if (closed) return
            log.warn(`ANOMALIE : l'écran « Activez les notifications » reste affiché après « Peut-être plus tard » (tap ${attempt}/${attempts})`)
        }
        throw new Error('Écran « Activez les notifications » toujours affiché après « Peut-être plus tard »')
    }

    /**
     * Premier élément natif qui correspond à `selector` (attend jusqu'à `timeout`), ou `null`. WDIO 10 refuse `$()`
     * quand plusieurs éléments correspondent ; sur iOS la feuille native et la page de la SPA derrière elle exposent
     * le même bouton (cf. locators) : on prend le premier et on le signale, sans critère natif/WebView ni position.
     */
    private async firstNative(selector: string, timeout: number): Promise<WebdriverIO.Element | null> {
        let found: WebdriverIO.Element[] = []
        await browser.waitUntil(async () => {
            found = Array.from(await $$(selector))
            return found.length > 0
        }, {timeout, interval: 300}).catch(() => undefined)
        if (found.length > 1) {
            log.warn(`ANOMALIE : ${found.length} éléments natifs correspondent à « ${selector} » (feuille native et page de la SPA ` +
                'superposées, même libellé) ; on prend le premier. Aucun identifiant ne les distingue (constaté sur iOS, 2026-10-08).')
        }
        return found[0] ?? null
    }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
