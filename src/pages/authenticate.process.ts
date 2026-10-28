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
import {getUser} from '../helpers/common/test-users'
import {currentUrlForLog, hasSessionToken, isOnBackendPageOutsideSpa, openAppRoot, replaceWithAppRoot} from '../helpers/common/session'
import {describeFirstScreenTimeout, HOME, isLoginCallbackUrl, pickFirstScreen} from '../helpers/common/first-screen'
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
// Sondes rapides du tour de boucle : l'accueil (« Bonjour ») et chaque page d'onboarding. La sortie normale
// est l'accueil ; on n'attend donc pas une page qui n'est pas là.
const HOME_PROBE_MS = 500
const ONBOARDING_PROBE_MS = 500
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

type FcScreen = 'review-picker' | 'login' | 'eidas' | 'credentials' | 'home'
type ConnectionScreen = Exclude<FcScreen, 'home'>

// Les écrans de connexion, dans l'ordre, et leurs actions associées.
const CONNECTION_SEQUENCE: Array<[ConnectionScreen, (user: TestUser) => Promise<void>]> = [
    ['review-picker', (): Promise<void> => EnvironmentPickerPage.reviewEnvironmentPicker()],
    ['login', (): Promise<void> => FranceConnectMirePage.tapFranceConnect(false)],
    ['eidas', async (): Promise<void> => {
        await FranceConnectEidasPage.selectEidasFaible()
    }],
    ['credentials', (user): Promise<void> => FranceConnectCredentialsPage.fillCredentials(user)],
]

// Les pages d'onboarding connues. Chacune : une sonde rapide et sa fermeture. Sur mobile, l'écran
// « notifications » peut être natif (feuille SwiftUI) : sa page le gère.
const ONBOARDING_PAGES: Array<{name: string, needsWeb: boolean, isVisible: () => Promise<boolean>, dismiss: () => Promise<void>}> = [
    // iOS : la feuille native des notifications, SEULE (sans la page de la SPA derrière), se traite avant les pages de la SPA
    // (au-dessus de la page « clé d'accès » juste après la connexion, son bouton « Activer » est unique).
    {name: 'notifications (feuille native)', needsWeb: false, isVisible: () => OnboardingNotificationsPage.isNativeSheetAlone(ONBOARDING_PROBE_MS), dismiss: async () => { await OnboardingNotificationsPage.dismissNativeSheet() }},
    {name: 'passkey', needsWeb: true, isVisible: () => OnboardingPasskeyPage.isVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingPasskeyPage.dismiss()},
    {name: 'zones', needsWeb: true, isVisible: () => OnboardingZonesPage.isVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingZonesPage.dismiss()},
    {name: 'notifications', needsWeb: true, isVisible: () => OnboardingNotificationsPage.isOnboardingVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingNotificationsPage.dismiss()},
]

/**
 * Cherche l'écran en cours en une requête sur la webview en cours.
 * L'appelant gère les écrans natifs.
 */
async function probeFranceConnectWebScreen(): Promise<FcScreen | null> {
    if (!await platform().isWebContextAvailable()) return null
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
async function detectCurrentScreen(): Promise<FcScreen | null> {
    if (await EnvironmentPickerPage.isEnvironmentPickerVisible(DETECTION_TIMEOUT_MS)) return 'review-picker'
    if (platform().fcButtonIsNative && await FranceConnectMirePage.isLoginScreenVisible()) return 'login'
    return await probeFranceConnectWebScreen()
}

/**
 * La séquence fonctionne bien en général.
 * On part de l'écran détecté et on essaye de finir la connexion. Un échec remonte à `reachHome`, qui
 * re-détecte l'écran et relance.
 */
async function runConnectionFrom(startScreen: ConnectionScreen, user: TestUser): Promise<void> {
    const startIndex = CONNECTION_SEQUENCE.findIndex(([screen]) => screen === startScreen)
    for (const [screen, run] of CONNECTION_SEQUENCE.slice(startIndex)) {
        await run(user)
        // Après le choix de l'environnement, l'app peut s'ouvrir DIRECTEMENT sur l'accueil (session conservée d'un démarrage à l'autre :
        // cookie `token` du WKWebsiteDataStore sur iOS) : on rend la main à la boucle, qui réobserve (accueil, onboarding, écran de
        // connexion) avant toute authentification FranceConnect. Mesuré le 2026-10-27 : enchaîner le choix et l'authentification sans
        // réobserver gaspillait ~35 s (« eIDAS faible » introuvable 10 s, « bouton FranceConnect » introuvable 15 s) avant l'accueil.
        if (screen === 'review-picker') return
    }
}

type OnboardingPage = (typeof ONBOARDING_PAGES)[number]

/** Première page d'onboarding affichée (sonde rapide), ou `null`. */
async function findVisibleOnboardingPage(): Promise<OnboardingPage | null> {
    // Sans WebView (feuille native seule, sélecteur d'environnement), on ne sonde pas le web : un contexte inexistant coûte 25 s par sonde.
    const webAvailable = await platform().isWebContextAvailable()
    for (const page of ONBOARDING_PAGES) {
        if (page.needsWeb && !webAvailable) continue
        if (await page.isVisible()) return page
    }
    return null
}

/**
 * Ferme la première page d'onboarding affichée. `true` si une page a été fermée (il faut alors réobserver).
 * `dismissals` compte les fermetures par page : une page qui revient sans cesse est une anomalie à signaler.
 */
async function dismissOnboardingPage(dismissals: Map<string, number>): Promise<boolean> {
    const page = await findVisibleOnboardingPage()
    if (!page) return false
    const count = (dismissals.get(page.name) ?? 0) + 1
    if (count > MAX_DISMISSALS_PER_PAGE)
        throw new AssertionError({message: `getAppToStartingState: la page d'onboarding « ${page.name} » revient après ${MAX_DISMISSALS_PER_PAGE} fermetures (${await currentUrlForLog()})`})
    dismissals.set(page.name, count)
    log.info(`getAppToStartingState: onboarding « ${page.name} » affiché, fermeture (${count}/${MAX_DISMISSALS_PER_PAGE})`)
    await page.dismiss()
    // Attend que la page ait quitté l'écran avant de réobserver : sinon la même page est vue juste après le clic (transition lente) et comptée comme un retour.
    await browser.waitUntil(async () => !await page.isVisible(), {timeout: DISMISS_GONE_TIMEOUT_MS, interval: 300})
        .catch(() => log.warn(`getAppToStartingState: la page d'onboarding « ${page.name} » est encore affichée ${DISMISS_GONE_TIMEOUT_MS}ms après sa fermeture`))
    return true
}

/**
 * Attend la PREMIÈRE apparition parmi {accueil, feuille native des notifications, passkey, zones, notifications} (jusqu'à
 * FIRST_SCREEN_TIMEOUT_MS) et retourne son nom. Échoue avec la raison (écrans attendus, durée, URL courante) si rien n'apparaît.
 * Ne traite pas l'écran : l'appelant le fait (la séquence peut se répéter, un écran peut manquer).
 */
async function waitForFirstScreen(): Promise<string> {
    const expected = [HOME, ...ONBOARDING_PAGES.map(p => p.name)]
    const startedAt = Date.now()
    let found: string | null = null
    await browser.waitUntil(async () => {
        const home = await platform().isWebContextAvailable() && await HomePage.isHomeDisplayed(HOME_PROBE_MS)
        const page = home ? null : await findVisibleOnboardingPage()
        found = pickFirstScreen([{screen: {name: HOME}, shown: home}, {screen: {name: page?.name ?? ''}, shown: page !== null}])?.name ?? null
        return found !== null
    }, {timeout: FIRST_SCREEN_TIMEOUT_MS, interval: 300}).catch(() => undefined)
    const waitedMs = Date.now() - startedAt
    if (found === null)
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
        if (await waitForFirstScreen() === HOME) {
            // iOS : la feuille native « Activez les notifications » peut recouvrir l'accueil.
            await OnboardingNotificationsPage.dismissNativeSheet()
            return
        }
        await dismissOnboardingPage(dismissals)
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
        // Un seul getContexts() par tour (3 à 10 s sur iOS) : sans WebView (sélecteur d'environnement, écran
        // natif), l'accueil et l'onboarding ne peuvent pas être affichés — on ne les sonde pas, sous peine
        // d'attendre un contexte WebView qui n'existe pas (25 s par sonde).
        // iOS : la feuille native « Activez les notifications » ne dépend pas de la WebView, qui peut ne pas être listée tant qu'elle est
        // affichée (session FranceConnect ouverte : retour direct à l'app, constaté le 2026-10-27 : « Aucune WebView trouvée après 25000ms »,
        // feuille visible en capture). On la traite donc avant de sonder le web.
        if (await OnboardingNotificationsPage.dismissNativeSheet(ONBOARDING_PROBE_MS)) {
            unrecognizedSince = null
            lastProgressAt = Date.now()
            continue
        }
        if (await platform().isWebContextAvailable()) {
            if (await HomePage.isHomeDisplayed(HOME_PROBE_MS)) {
                // iOS : la feuille native « Activez les notifications » peut recouvrir l'accueil (session restaurée au relancement).
                await OnboardingNotificationsPage.dismissNativeSheet()
                return
            }

            if (await dismissOnboardingPage(dismissals)) {
                unrecognizedSince = null
                lastProgressAt = Date.now()
                continue
            }

            // Retour de FranceConnect (`login-callback`) : l'app charge, aucun écran n'est encore là. On attend le premier (le temps d'attente est
            // un progrès : la connexion a abouti), au lieu de sonder à vide puis de recharger la racine.
            if (isLoginCallbackUrl(await currentUrlForLog())) {
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
        }

        const screen = await detectCurrentScreen()
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
    const user = getUser('avec_nom_dusage')

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
            await reachHome(getUser('avec_nom_dusage')) // ferme un éventuel onboarding : la déconnexion part de l'accueil
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
