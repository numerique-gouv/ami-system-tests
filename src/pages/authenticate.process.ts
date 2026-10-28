import EnvironmentPickerPage from './franceconnect/environment-picker.page'
import FranceConnectMirePage, {FranceConnectProviderError} from './franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from './franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from './franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from './onboarding-passkey.page'
import OnboardingZonesPage from './onboarding-zones.page'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import HomePage from './home.page'
import ProfilePage from './profile.page'
import {platform} from '../platform'
import type {TestUser} from '../helpers/common/test-users'
import {getTestUser} from '../helpers/common/test-users'
import {currentUrlForLog, hasSessionToken, isOnBackendPageOutsideSpa, openAppRoot, replaceWithAppRoot} from '../helpers/common/session'
import {describeFirstScreenTimeout, HOME, isLoginCallbackUrl} from '../helpers/common/first-screen'
import logger from '@wdio/logger'
import {AssertionError} from "node:assert";

const log = logger('helper')

// La boucle échoue après ce délai SANS progrès (écran de connexion franchi, page d'onboarding fermée) : une
// action longue mais réussie (ex. saisie des identifiants, 22 s mesurées sur Android) ne le consomme pas.
const NO_PROGRESS_TIMEOUT_MS = 30000
// Plafond absolu, quoi qu'il arrive (progrès sans fin).
const AUTHENTICATE_MAX_MS = 300000
// Une page d'onboarding qui revient après autant de fermetures ne se ferme pas : on échoue clairement.
const MAX_DISMISSALS_PER_PAGE = 3
// borne un simple check de présence (doit rester rapide, ré-exécuté à chaque tentative). Le sélecteur d'environnement est natif : il est
// lisible tout de suite quand il est affiché (2 s d'attente par tour de boucle mesurées le 2026-10-27 sur iOS, pour rien : la boucle re-sonde).
const DETECTION_TIMEOUT_MS = 500
// Sonde de l'accueil (« Bonjour ») hors de `probeScreen`, dont les sondes sont immédiates (la boucle appelante réessaie).
const HOME_PROBE_MS = 500
// Rien de reconnu (ni accueil, ni onboarding, ni écran de connexion) pendant ce délai : on recharge la racine
// de l'app une fois. Assez long pour laisser finir une redirection en cours (ex. fin de session FranceConnect : transitions mesurées ≤ 3 s
// le 2026-10-27, iOS, machine chargée ; 15 s auparavant, dont 15 s perdues sur `#/welcome/notifications` resté blanc).
const UNRECOGNIZED_BEFORE_ROOT_MS = 8000
// Page d'accueil de première connexion restée BLANCHE (`#/welcome/notifications`, puis `/notifications-welcome-page` : constaté le 2026-10-27,
// iOS, quand la permission de notifications est déjà décidée — la feuille native ne vient pas) : seul un rechargement de la racine en sort ;
// inutile d'attendre autant que pour une page inconnue.
const WELCOME_BLANK_BEFORE_ROOT_MS = 3000
// Après la connexion FranceConnect (route `login-callback`), l'app charge avant d'afficher son premier écran (un geo.api.gouv.fr lent
// retarde l'écran « clé d'accès » : mesuré). On attend ce premier écran (accueil ou onboarding) plutôt que de sonder 500 ms par page
// et de recharger la racine, ce qui interrompt le chargement.
const FIRST_SCREEN_TIMEOUT_MS = 25000
// Délai laissé à une page d'onboarding pour disparaître après son clic de fermeture.
const DISMISS_GONE_TIMEOUT_MS = 10000
const WELCOME_BLANK_ROUTE = /welcome\/notifications|notifications-welcome-page/

type FcScreen = 'login' | 'eidas' | 'credentials' | 'home'
type ConnectionScreen = Exclude<FcScreen, 'home'>

// Les écrans de connexion, dans l'ordre, et leurs actions associées.
const CONNECTION_SEQUENCE: Array<[ConnectionScreen, (user: TestUser) => Promise<void>]> = [
    ['login', (): Promise<void> => FranceConnectMirePage.tapFranceConnect(false)],
    ['eidas', async (): Promise<void> => {
        await FranceConnectEidasPage.selectEidasFaible()
    }],
    ['credentials', (user): Promise<void> => FranceConnectCredentialsPage.fillCredentials(user)],
]

// Les écrans reconnus par `probeScreen` (autres que l'accueil), chacun avec sa sonde immédiate et sa fermeture. Sur mobile, l'écran
// « notifications » peut être natif (feuille SwiftUI) : sa page le gère.
type OnboardingPage = {name: string, isVisible: () => Promise<boolean>, dismiss: () => Promise<void>}

// Natif : sélecteur d'environnement. Il revient seul, sans WebView, après l'alerte système de notifications iOS (preuve : capture de la
// trace de `authentification.smoke`, 2026-10-28, bandeau « Les notifications ont été activées » au-dessus de la liste des environnements) :
// on re-choisit l'environnement, la session (cookie conservé) rouvre l'accueil.
const ENVIRONMENT_PICKER: OnboardingPage = {name: 'sélecteur d\'environnement', isVisible: () => EnvironmentPickerPage.isEnvironmentPickerVisible(DETECTION_TIMEOUT_MS), dismiss: () => EnvironmentPickerPage.reviewEnvironmentPicker()}
// iOS : la feuille native des notifications (au-dessus de la page « clé d'accès » juste après la connexion : à traiter avant les pages de la SPA).
const NATIVE_SHEET: OnboardingPage = {name: 'notifications (feuille native)', isVisible: () => OnboardingNotificationsPage.isNativeSheetShownNow(), dismiss: async () => { await OnboardingNotificationsPage.dismissNativeSheet() }}
// Pages de la SPA, sondées toutes dans UN seul passage en WebView.
const WEB_PAGES: OnboardingPage[] = [
    {name: 'passkey', isVisible: () => OnboardingPasskeyPage.isVisible(0), dismiss: () => OnboardingPasskeyPage.dismiss()},
    {name: 'zones', isVisible: () => OnboardingZonesPage.isVisible(0), dismiss: () => OnboardingZonesPage.dismiss()},
    {name: 'notifications', isVisible: () => OnboardingNotificationsPage.isWebOnboardingVisible(0), dismiss: () => OnboardingNotificationsPage.dismiss()},
]
// Natif, sondé après le passage en WebView : écran des notifications d'un ancien build Android, bouton « plus tard » de la feuille iOS.
const NATIVE_NOTIFICATIONS: OnboardingPage = {name: 'notifications (natif)', isVisible: () => OnboardingNotificationsPage.isNativeOnboardingVisible(0), dismiss: () => OnboardingNotificationsPage.dismiss()}
const ONBOARDING_PAGES: OnboardingPage[] = [ENVIRONMENT_PICKER, NATIVE_SHEET, ...WEB_PAGES, NATIVE_NOTIFICATIONS]
// Aucune WebView et aucun écran natif reconnu (app en relancement, chargement) : pas un écran à traiter, on attend.
const NATIVE_ALONE = 'écran natif seul (aucune WebView)'

/**
 * UN tour de sonde : nom de l'écran affiché (HOME, une page de ONBOARDING_PAGES, ou NATIVE_ALONE), `null` si la WebView n'en montre aucun
 * de connu. Un seul getContexts et un seul passage natif → WebView par tour (mesuré : une sonde « 500 ms » par écran en coûtait 1 à 3 s
 * chacune, bascule de contexte et captures du service DevTools comprises) ; les sondes y sont immédiates, la boucle appelante réessaie.
 */
async function probeScreen(): Promise<string | null> {
    for (const page of [ENVIRONMENT_PICKER, NATIVE_SHEET]) if (await page.isVisible()) return page.name
    if (!await platform().isWebContextAvailable()) return NATIVE_ALONE
    const web = await platform().inWebContext(async () => {
        if (await HomePage.isHomeDisplayed(0)) return HOME
        for (const page of WEB_PAGES) if (await page.isVisible()) return page.name
        return null
    })
    if (web !== null) return web
    return await NATIVE_NOTIFICATIONS.isVisible() ? NATIVE_NOTIFICATIONS.name : null
}

/**
 * Cherche l'écran en cours en une requête sur la webview en cours.
 * L'appelant gère les écrans natifs.
 */
async function probeFranceConnectWebScreen(): Promise<FcScreen | null> {
    return await platform().inWebContext(async () => {
        // Vérifié avant le bandeau générique "credentials" ci-dessous : la page d'erreur
        // technique FCP-LOW partage le même bandeau que le vrai formulaire de login. Sans cette
        // distinction, la boucle de getAppToStartingState() reboucle sur "credentials" jusqu'au
        // TIMEOUT au lieu d'échouer net (cf. FranceConnectMirePage.detectProviderErrorBare()).
        const providerError = await FranceConnectMirePage.detectProviderErrorBare()
        if (providerError) throw providerError
        return driver.execute(() => {
            // Parcours d'accueil de première connexion : l'étape 'home' le passe (cf. OnboardingZonesPage / OnboardingNotificationsPage).
            if (/#\/welcome\/(zones|notifications)/.test(location.hash)) return 'home'
            // Restreint à <button> : la mire eIDAS de FranceConnect (hors contrôle de l'app AMI)
            // contient elle-même le mot "FranceConnect" dans un lien de pied de page — un simple
            // innerText.includes() sur tout le body matcherait donc aussi cet écran suivant.
            const hasButtonTextIncluding = (needle: string): boolean =>
                Array.from(document.querySelectorAll('button'))
                    .some(b => b.textContent?.toLowerCase().includes(needle))
            // <h1> depuis la SPA du 2026-10-02 (était <p>) : on tolère les deux (cf. HomePage.probeWelcomeText).
            if (Array.from(document.querySelectorAll('h1, p'))
                .some(p => (p as HTMLElement).innerText?.trim().startsWith('Bonjour')))
                return 'home'
            if (hasButtonTextIncluding('franceconnect')) return 'login'
            if (Array.from(document.querySelectorAll('button, a'))
                .some(el => el.textContent?.toLowerCase().includes('eidas faible')))
                return 'eidas'
            // `.` à la place de l'apostrophe : tolère apostrophe droite (') et typographique (’)
            if (/Fournisseur d.identité de démonstration - FCP-LOW/.test(document.body.innerText))
                return 'credentials'
            return null
        }) as Promise<FcScreen | null>
    }).catch((err: unknown) => {
        if (err instanceof FranceConnectProviderError) throw err
        log.debug('authenticate: probeFranceConnectWebScreen a échoué', err)
        return null
    })
}

// trouve l'écran courant en commençant par les natifs.
async function detectCurrentScreen(probed: string | null): Promise<FcScreen | null> {
    if (platform().fcButtonIsNative && await FranceConnectMirePage.isLoginScreenVisible()) return 'login'
    return probed === NATIVE_ALONE ? null : await probeFranceConnectWebScreen()
}

/**
 * La séquence fonctionne bien en général.
 * On part de l'écran détecté et on essaye de finir la connexion. Un échec remonte à `reachHome`, qui
 * re-détecte l'écran et relance.
 */
async function runConnectionFrom(startScreen: ConnectionScreen, user: TestUser): Promise<void> {
    const startIndex = CONNECTION_SEQUENCE.findIndex(([screen]) => screen === startScreen)
    for (const [, run] of CONNECTION_SEQUENCE.slice(startIndex)) {
        await run(user)
    }
}

/**
 * Ferme la page affichée (il faut ensuite réobserver). `dismissals` compte les fermetures par page : une page qui revient sans cesse
 * est une anomalie à signaler.
 */
async function dismissOnboardingPage(page: OnboardingPage, dismissals: Map<string, number>): Promise<void> {
    const count = (dismissals.get(page.name) ?? 0) + 1
    if (count > MAX_DISMISSALS_PER_PAGE)
        throw new AssertionError({message: `getAppToStartingState: la page d'onboarding « ${page.name} » revient après ${MAX_DISMISSALS_PER_PAGE} fermetures (${await currentUrlForLog()})`})
    dismissals.set(page.name, count)
    log.info(`getAppToStartingState: onboarding « ${page.name} » affiché, fermeture (${count}/${MAX_DISMISSALS_PER_PAGE})`)
    await page.dismiss()
    // Attend que la page ait quitté l'écran avant de réobserver : sinon la même page est vue juste après le clic (transition lente) et comptée comme un retour.
    await browser.waitUntil(async () => !await page.isVisible(), {timeout: DISMISS_GONE_TIMEOUT_MS, interval: 300})
        .catch(() => log.warn(`getAppToStartingState: la page d'onboarding « ${page.name} » est encore affichée ${DISMISS_GONE_TIMEOUT_MS}ms après sa fermeture`))
}

/**
 * Attend la PREMIÈRE apparition parmi {accueil, sélecteur d'environnement, feuille native des notifications, passkey, zones, notifications}
 * (jusqu'à FIRST_SCREEN_TIMEOUT_MS) et retourne son nom. « Écran natif seul » n'en est pas un : on attend la WebView. Échoue avec la
 * raison (écrans attendus, durée, URL courante) si rien n'apparaît.
 * Ne traite pas l'écran : l'appelant le fait (la séquence peut se répéter, un écran peut manquer).
 */
async function waitForFirstScreen(): Promise<string> {
    const expected = [HOME, ...ONBOARDING_PAGES.map(p => p.name)]
    const startedAt = Date.now()
    let found = null as string | null
    await browser.waitUntil(async () => {
        found = await probeScreen()
        return found !== null && found !== NATIVE_ALONE
    }, {timeout: FIRST_SCREEN_TIMEOUT_MS, interval: 300}).catch(() => undefined)
    const waitedMs = Date.now() - startedAt
    if (found === null || found === NATIVE_ALONE)
        throw new AssertionError({message: `getAppToStartingState: ${describeFirstScreenTimeout(expected, await currentUrlForLog(), waitedMs)}`})
    log.info(`getAppToStartingState: premier écran « ${found} » apparu après ${waitedMs}ms d'attente (${await currentUrlForLog()})`)
    return found
}

/**
 * À appeler juste après la connexion FranceConnect : enchaîne les écrans d'onboarding jusqu'à l'accueil. À chaque tour, attend la
 * PREMIÈRE apparition parmi {accueil, passkey, zones, notifications} (un geo.api.gouv.fr lent retarde le premier écran), traite l'écran
 * trouvé puis recommence : la séquence peut se répéter et un écran peut manquer. Échoue avec la raison si rien n'apparaît.
 */
export async function passOnboardingToHome(): Promise<void> {
    const dismissals = new Map<string, number>()
    const startedAt = Date.now()
    while (Date.now() - startedAt < AUTHENTICATE_MAX_MS) {
        const screen = await waitForFirstScreen()
        if (screen === HOME) {
            // iOS : la feuille native « Activez les notifications » peut recouvrir l'accueil.
            await OnboardingNotificationsPage.dismissNativeSheet()
            return
        }
        await dismissOnboardingPage(ONBOARDING_PAGES.find(p => p.name === screen) as OnboardingPage, dismissals)
    }
    throw new AssertionError({message: `passOnboardingToHome: l'accueil n'est pas atteint en ${Math.round(AUTHENTICATE_MAX_MS / 1000)}s (${await currentUrlForLog()})`})
}

// Au-delà de ce nombre d'échecs de la séquence de connexion, aucune progression n'est possible :
// elle ne comporte que CONNECTION_SEQUENCE.length écrans distincts, +1 pour absorber un échec ponctuel
// (ex. re-détection après un clic qui n'a pas encore pris effet). On préfère échouer vite avec un message clair.
const MAX_CONNECTION_FAILURES = CONNECTION_SEQUENCE.length + 1

/**
 * Tourne jusqu'à l'accueil : à chaque tour, « Bonjour » → fini ; sinon une page d'onboarding connue → on la
 * ferme ; sinon un écran de connexion → on déroule la séquence ; sinon on laisse la page évoluer.
 */
async function reachHome(user: TestUser): Promise<void> {
    const startedAt = Date.now()
    let lastProgressAt = startedAt
    const dismissals = new Map<string, number>()
    let connectionFailures = 0
    let unrecognizedSince: number | null = null
    let rootOpened = false

    while (Date.now() - lastProgressAt < NO_PROGRESS_TIMEOUT_MS && Date.now() - startedAt < AUTHENTICATE_MAX_MS) {
        // UN tour de sonde (cf. probeScreen) : accueil, page d'onboarding (feuille native iOS comprise, qui ne dépend pas de la WebView),
        // sélecteur d'environnement, ou « écran natif seul » (aucune WebView : rien de web n'est sondé, sous peine d'attendre un contexte inexistant).
        const probed = await probeScreen()
        if (probed === HOME) {
            // iOS : la feuille native « Activez les notifications » peut recouvrir l'accueil (session restaurée au relancement).
            await OnboardingNotificationsPage.dismissNativeSheet()
            return
        }
        const page = ONBOARDING_PAGES.find(p => p.name === probed)
        if (page) {
            await dismissOnboardingPage(page, dismissals)
            unrecognizedSince = null
            lastProgressAt = Date.now()
            continue
        }

        // Retour de FranceConnect (`login-callback`) : l'app charge, aucun écran n'est encore là. On attend le premier (le temps d'attente est
        // un progrès : la connexion a abouti), au lieu de sonder à vide puis de recharger la racine.
        if (probed === null && isLoginCallbackUrl(await currentUrlForLog())) {
            lastProgressAt = Date.now()
            try {
                await waitForFirstScreen()
                unrecognizedSince = null
                lastProgressAt = Date.now()
                continue
            } catch (err) {
                log.warn(String(err instanceof Error ? err.message : err))
            }
        }

        const screen = await detectCurrentScreen(probed)
        if (screen !== null && screen !== 'home') {
            unrecognizedSince = null
            try {
                await runConnectionFrom(screen, user)
                lastProgressAt = Date.now()
            } catch (err) {
                connectionFailures++
                log.warn(`getAppToStartingState: échec depuis l'écran "${screen}" (échec ${connectionFailures}/${MAX_CONNECTION_FAILURES})`, err)
                if (connectionFailures >= MAX_CONNECTION_FAILURES) throw err
            }
            continue
        }

        unrecognizedSince ??= Date.now()
        const unrecognizedFor = Date.now() - unrecognizedSince
        const blankWelcome = unrecognizedFor > WELCOME_BLANK_BEFORE_ROOT_MS && WELCOME_BLANK_ROUTE.test(await currentUrlForLog())
        if (!rootOpened && (blankWelcome || unrecognizedFor > UNRECOGNIZED_BEFORE_ROOT_MS)) {
            rootOpened = true
            log.warn(`ANOMALIE : page non reconnue depuis ${unrecognizedFor}ms (${await currentUrlForLog()}), rechargement de la racine de l'app.`)
            await openAppRoot().catch((err: unknown) => log.warn('getAppToStartingState: rechargement de la racine impossible', err))
        }
    }

    throw new AssertionError({
        message: `getAppToStartingState: l'accueil n'est pas atteint (${Math.round((Date.now() - lastProgressAt) / 1000)}s sans progrès, ${Math.round((Date.now() - startedAt) / 1000)}s au total, ${await currentUrlForLog()})`
    })
}

/**
 * Remet l'app dans l'état de départ attendu par les tests : connecté, sur l'accueil. Le consentement partenaire
 * n'est pas touché : les scénarios qui publient le donnent explicitement (grantDemarchesConsent). Chaque test
 * (sauf l'authentification) commence par là : le test précédent a pu s'arrêter n'importe où dans l'app.
 *
 * 0. Accueil déjà affiché (le test précédent s'est terminé connecté) → fini, rien n'est rechargé ni refait.
 * 1. WebView sur une page serveur du backend hors de la SPA (cible d'un lien de démarche suivi par le test précédent) ou cookie de
 *    session présent → chargement de la racine de l'app (la SPA route vers l'accueil, la session est conservée).
 * 2. Absent → rien n'est touché : la boucle déroule la connexion (sélecteur d'environnement, FranceConnect,
 *    eIDAS, identifiants) à partir de l'écran affiché.
 * 3. Jusqu'à l'accueil (« Bonjour »), les pages d'onboarding connues sont fermées.
 * 4. L'URL d'arrivée est journalisée.
 */
export async function getAppToStartingState(): Promise<void> {
    const user = getTestUser()

    // 0. Déjà connecté ET sur l'accueil (cas du test précédent qui s'est terminé connecté) : rien à faire, ni rechargement
    //    ni authentification. L'accueil n'est lisible que session ouverte.
    if (await platform().isWebContextAvailable() && await HomePage.isHomeDisplayed(HOME_PROBE_MS)) {
        await OnboardingNotificationsPage.dismissNativeSheet()
        log.info(`getAppToStartingState: déjà connecté, accueil affiché, aucune authentification (${await currentUrlForLog()})`)
        return
    }

    if (await isOnBackendPageOutsideSpa()) {
        log.info(`getAppToStartingState: WebView sur une page du backend hors de la SPA (${await currentUrlForLog()}), remplacement par la racine de l'app`)
        await replaceWithAppRoot()
    } else if (await hasSessionToken()) {
        log.info('getAppToStartingState: session ouverte, chargement de la racine de l\'app')
        await openAppRoot()
    } else {
        log.info('getAppToStartingState: pas de session lisible, connexion depuis l\'écran affiché')
    }
    await reachHome(user)
    log.info(`getAppToStartingState: état de départ atteint, URL : ${await currentUrlForLog()}`)
}

/**
 * Remet l'app dans l'état de départ du test d'authentification : environnement choisi, NON connecté, sur l'écran de
 * connexion. L'app iOS garde la session ouverte d'un démarrage à l'autre (cookie `token` dans le `WKWebsiteDataStore`
 * par défaut, persistant) : une fois l'environnement choisi, l'app peut s'ouvrir directement sur l'accueil. On le vérifie
 * donc et, si une session est ouverte, on se déconnecte explicitement (page d'onboarding éventuelle fermée d'abord).
 *
 * Sans WebView (sélecteur d'environnement encore affiché, écran de connexion natif Android) : déjà déconnecté.
 */
export async function getAppToLoggedOutState(): Promise<void> {
    await EnvironmentPickerPage.reviewEnvironmentPicker()
    if (!await platform().isWebContextAvailable()) return

    const startedAt = Date.now()
    let rootOpened = false
    while (Date.now() - startedAt < UNRECOGNIZED_BEFORE_ROOT_MS * 2) {
        if (await FranceConnectMirePage.isLoginScreenVisible()) return
        if (await hasSessionToken() || await HomePage.isHomeDisplayed(HOME_PROBE_MS)) {
            log.warn('getAppToLoggedOutState: session déjà ouverte au démarrage de l\'app, déconnexion explicite')
            // Au relancement de l'app avec une session ouverte, la feuille native « Activez les notifications » peut recouvrir l'accueil
            // (notifications non décidées, minuterie en mémoire remise à zéro) : l'accueil est lisible mais la WebView ne répond plus.
            await OnboardingNotificationsPage.dismiss()
            await reachHome(getTestUser()) // ferme un éventuel onboarding : la déconnexion part de l'accueil
            await platform().inWebContext(() => ProfilePage.logout())
            await FranceConnectMirePage.waitForLoginScreen()
            return
        }
        // Rien de reconnu (page vide `?is_logged_out`, chargement) : un seul rechargement de la racine, puis on réobserve.
        if (!rootOpened && Date.now() - startedAt > UNRECOGNIZED_BEFORE_ROOT_MS) {
            rootOpened = true
            await openAppRoot().catch((err: unknown) => log.warn('getAppToLoggedOutState: rechargement de la racine impossible', err))
        }
    }
    throw new AssertionError({message: `getAppToLoggedOutState: ni écran de connexion ni session reconnus (${await currentUrlForLog()})`})
}
