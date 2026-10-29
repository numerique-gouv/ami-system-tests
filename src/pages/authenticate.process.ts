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
import {HOME, isLoginCallbackUrl} from '../helpers/common/first-screen'
import {AssertionError} from "node:assert";

// Échec après ce délai sans progrès (écran de connexion franchi, page d'onboarding fermée) : une action longue mais réussie ne le consomme pas.
const NO_PROGRESS_TIMEOUT_MS = 30000
const AUTHENTICATE_MAX_MS = 300000
// Une page d'onboarding qui revient après autant de fermetures ne se ferme pas.
const MAX_DISMISSALS_PER_PAGE = 3
// Simple vérification de présence, ré-exécutée à chaque tour de boucle.
const DETECTION_TIMEOUT_MS = 500
const HOME_PROBE_MS = 500
// Rien de reconnu pendant ce délai : la racine de l'app est rechargée, une fois.
const UNRECOGNIZED_BEFORE_ROOT_MS = 8000
// Page d'accueil de première connexion restée blanche : seul un rechargement de la racine en sort.
const WELCOME_BLANK_BEFORE_ROOT_MS = 3000
// Après la connexion FranceConnect, l'app charge avant d'afficher son premier écran.
const FIRST_SCREEN_TIMEOUT_MS = 25000
const DISMISS_GONE_TIMEOUT_MS = 10000
const WELCOME_BLANK_ROUTE = /welcome\/notifications|notifications-welcome-page/

type FcScreen = 'login' | 'eidas' | 'credentials' | 'home'
type ConnectionScreen = Exclude<FcScreen, 'home'>

const CONNECTION_SEQUENCE: Array<[ConnectionScreen, (user: TestUser) => Promise<void>]> = [
    ['login', (): Promise<void> => FranceConnectMirePage.tapFranceConnect(false)],
    ['eidas', async (): Promise<void> => {
        await FranceConnectEidasPage.selectEidasFaible()
    }],
    ['credentials', (user): Promise<void> => FranceConnectCredentialsPage.fillCredentials(user)],
]

type OnboardingPage = {name: string, isVisible: () => Promise<boolean>, dismiss: () => Promise<void>}

const ENVIRONMENT_PICKER: OnboardingPage = {name: 'sélecteur d\'environnement', isVisible: () => EnvironmentPickerPage.isEnvironmentPickerVisible(DETECTION_TIMEOUT_MS), dismiss: () => EnvironmentPickerPage.reviewEnvironmentPicker()}
// iOS : feuille native des notifications, à traiter avant les pages de la SPA qu'elle recouvre.
const NATIVE_SHEET: OnboardingPage = {name: 'notifications (feuille native)', isVisible: () => OnboardingNotificationsPage.isNativeSheetShownNow(), dismiss: async () => { await OnboardingNotificationsPage.dismissNativeSheet() }}
const WEB_PAGES: OnboardingPage[] = [
    {name: 'passkey', isVisible: () => OnboardingPasskeyPage.isVisible(0), dismiss: () => OnboardingPasskeyPage.dismiss()},
    {name: 'zones', isVisible: () => OnboardingZonesPage.isVisible(0), dismiss: () => OnboardingZonesPage.dismiss()},
    {name: 'notifications', isVisible: () => OnboardingNotificationsPage.isWebOnboardingVisible(0), dismiss: () => OnboardingNotificationsPage.dismiss()},
]
// Natif, sondé après la WebView : écran des notifications d'un ancien build Android, bouton « plus tard » de la feuille iOS.
const NATIVE_NOTIFICATIONS: OnboardingPage = {name: 'notifications (natif)', isVisible: () => OnboardingNotificationsPage.isNativeOnboardingVisible(0), dismiss: () => OnboardingNotificationsPage.dismiss()}
const ONBOARDING_PAGES: OnboardingPage[] = [ENVIRONMENT_PICKER, NATIVE_SHEET, ...WEB_PAGES, NATIVE_NOTIFICATIONS]
// Aucune WebView ni écran natif reconnu (relancement, chargement) : on attend.
const NATIVE_ALONE = 'écran natif seul (aucune WebView)'

/** UN tour de sonde : nom de l'écran affiché (HOME, une page d'ONBOARDING_PAGES ou NATIVE_ALONE), `null` si aucun n'est connu. */
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

/** Écran de connexion en cours, en une requête sur la WebView ; les écrans natifs sont gérés par l'appelant. */
async function probeFranceConnectWebScreen(): Promise<FcScreen | null> {
    return await platform().inWebContext(async () => {
        // Avant le bandeau « credentials » : la page d'erreur FCP-LOW partage son bandeau.
        const providerError = await FranceConnectMirePage.detectProviderErrorBare()
        if (providerError) throw providerError
        return driver.execute(() => {
            if (/#\/welcome\/(zones|notifications)/.test(location.hash)) return 'home'
            // Restreint à <button> : la mire eIDAS contient « FranceConnect » dans un lien de pied de page.
            const hasButtonTextIncluding = (needle: string): boolean =>
                Array.from(document.querySelectorAll('button'))
                    .some(b => b.textContent?.toLowerCase().includes(needle))
            if (Array.from(document.querySelectorAll('h1, p'))
                .some(p => (p as HTMLElement).innerText?.trim().startsWith('Bonjour')))
                return 'home'
            if (hasButtonTextIncluding('franceconnect')) return 'login'
            if (Array.from(document.querySelectorAll('button, a'))
                .some(el => el.textContent?.toLowerCase().includes('eidas faible')))
                return 'eidas'
            // `.` tolère l'apostrophe droite et la typographique
            if (/Fournisseur d.identité de démonstration - FCP-LOW/.test(document.body.innerText))
                return 'credentials'
            return null
        }) as Promise<FcScreen | null>
    }).catch((err: unknown) => {
        if (err instanceof FranceConnectProviderError) throw err
        return null
    })
}

async function detectCurrentScreen(probed: string | null): Promise<FcScreen | null> {
    if (FranceConnectMirePage.hasNativeLoginButton() && await FranceConnectMirePage.isLoginScreenVisible()) return 'login'
    return probed === NATIVE_ALONE ? null : await probeFranceConnectWebScreen()
}

/** Déroule la connexion à partir de l'écran détecté ; un échec remonte à `reachHome`, qui re-détecte l'écran et relance. */
async function runConnectionFrom(startScreen: ConnectionScreen, user: TestUser): Promise<void> {
    const startIndex = CONNECTION_SEQUENCE.findIndex(([screen]) => screen === startScreen)
    for (const [, run] of CONNECTION_SEQUENCE.slice(startIndex)) {
        await run(user)
    }
}

/** Ferme la page affichée, en comptant les fermetures par page : une page qui revient sans cesse est une anomalie. */
async function dismissOnboardingPage(page: OnboardingPage, dismissals: Map<string, number>): Promise<void> {
    const count = (dismissals.get(page.name) ?? 0) + 1
    if (count > MAX_DISMISSALS_PER_PAGE)
        throw new AssertionError({message: `getAppToStartingState: la page d'onboarding « ${page.name} » revient après ${MAX_DISMISSALS_PER_PAGE} fermetures (${await currentUrlForLog()})`})
    dismissals.set(page.name, count)
    await page.dismiss()
    // Sinon la même page, vue juste après le clic, serait comptée comme un retour.
    await browser.waitUntil(async () => !await page.isVisible(), {timeout: DISMISS_GONE_TIMEOUT_MS, interval: 300})
        .catch(() => undefined)
}

/** Attend la première apparition d'un écran connu (« écran natif seul » n'en est pas un) et retourne son nom ; l'appelant le traite. */
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
        throw new AssertionError({message: `getAppToStartingState: aucun des écrans attendus (${expected.join(', ')}) n'est apparu en ${Math.round(waitedMs / 1000)}s (${await currentUrlForLog()})`})
    return found
}

/** À appeler après la connexion FranceConnect : traite chaque écran d'onboarding qui apparaît, dans l'ordre où il vient, jusqu'à l'accueil. */
export async function passOnboardingToHome(): Promise<void> {
    const dismissals = new Map<string, number>()
    const startedAt = Date.now()
    while (Date.now() - startedAt < AUTHENTICATE_MAX_MS) {
        const screen = await waitForFirstScreen()
        if (screen === HOME) {
            await OnboardingNotificationsPage.dismissNativeSheet()
            return
        }
        await dismissOnboardingPage(ONBOARDING_PAGES.find(p => p.name === screen) as OnboardingPage, dismissals)
    }
    throw new AssertionError({message: `passOnboardingToHome: l'accueil n'est pas atteint en ${Math.round(AUTHENTICATE_MAX_MS / 1000)}s (${await currentUrlForLog()})`})
}

// La séquence a CONNECTION_SEQUENCE.length écrans distincts, +1 pour un échec ponctuel : au-delà, aucune progression n'est possible.
const MAX_CONNECTION_FAILURES = CONNECTION_SEQUENCE.length + 1

/** Tourne jusqu'à l'accueil : fini à « Bonjour », sinon ferme l'onboarding connu, sinon déroule la connexion, sinon laisse la page évoluer. */
async function reachHome(user: TestUser): Promise<void> {
    const startedAt = Date.now()
    let lastProgressAt = startedAt
    const dismissals = new Map<string, number>()
    let connectionFailures = 0
    let unrecognizedSince: number | null = null
    let rootOpened = false

    while (Date.now() - lastProgressAt < NO_PROGRESS_TIMEOUT_MS && Date.now() - startedAt < AUTHENTICATE_MAX_MS) {
        const probed = await probeScreen()
        if (probed === HOME) {
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

        // Retour de FranceConnect : l'attente du premier écran est un progrès, la connexion a abouti.
        if (probed === null && isLoginCallbackUrl(await currentUrlForLog())) {
            lastProgressAt = Date.now()
            try {
                await waitForFirstScreen()
                unrecognizedSince = null
                lastProgressAt = Date.now()
                continue
            } catch {
                // aucun écran : on continue la boucle
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
                if (connectionFailures >= MAX_CONNECTION_FAILURES) throw err
            }
            continue
        }

        unrecognizedSince ??= Date.now()
        const unrecognizedFor = Date.now() - unrecognizedSince
        const blankWelcome = unrecognizedFor > WELCOME_BLANK_BEFORE_ROOT_MS && WELCOME_BLANK_ROUTE.test(await currentUrlForLog())
        if (!rootOpened && (blankWelcome || unrecognizedFor > UNRECOGNIZED_BEFORE_ROOT_MS)) {
            rootOpened = true
            await openAppRoot().catch(() => undefined)
        }
    }

    throw new AssertionError({
        message: `getAppToStartingState: l'accueil n'est pas atteint (${Math.round((Date.now() - lastProgressAt) / 1000)}s sans progrès, ${Math.round((Date.now() - startedAt) / 1000)}s au total, ${await currentUrlForLog()})`
    })
}

/**
 * Remet l'app dans l'état de départ des tests : connecté, sur l'accueil. Le consentement partenaire n'est pas touché (les scénarios qui
 * publient le donnent). Chaque test sauf l'authentification commence par là : le précédent a pu s'arrêter n'importe où.
 */
export async function getAppToStartingState(): Promise<void> {
    const user = getTestUser()

    // Déjà sur l'accueil (lisible seulement session ouverte) : rien à faire.
    if (await platform().isWebContextAvailable() && await HomePage.isHomeDisplayed(HOME_PROBE_MS)) {
        await OnboardingNotificationsPage.dismissNativeSheet()
        return
    }

    if (await isOnBackendPageOutsideSpa()) await replaceWithAppRoot()
    else if (await hasSessionToken()) await openAppRoot()
    await reachHome(user)
}

/** Remet l'app dans l'état de départ du test d'authentification : environnement choisi, non connecté, sur l'écran de connexion (déconnexion explicite si une session est ouverte). */
export async function getAppToLoggedOutState(): Promise<void> {
    await EnvironmentPickerPage.reviewEnvironmentPicker()
    if (!await platform().isWebContextAvailable()) return

    const startedAt = Date.now()
    let rootOpened = false
    while (Date.now() - startedAt < UNRECOGNIZED_BEFORE_ROOT_MS * 2) {
        if (await FranceConnectMirePage.isLoginScreenVisible()) return
        if (await hasSessionToken() || await HomePage.isHomeDisplayed(HOME_PROBE_MS)) {
            // La feuille native des notifications peut recouvrir l'accueil : lisible mais WebView muette.
            await OnboardingNotificationsPage.dismiss()
            await reachHome(getTestUser()) // ferme un éventuel onboarding : la déconnexion part de l'accueil
            await platform().inWebContext(() => ProfilePage.logout())
            await FranceConnectMirePage.waitForLoginScreen()
            return
        }
        // Rien de reconnu : un seul rechargement de la racine, puis on réobserve.
        if (!rootOpened && Date.now() - startedAt > UNRECOGNIZED_BEFORE_ROOT_MS) {
            rootOpened = true
            await openAppRoot().catch(() => undefined)
        }
    }
    throw new AssertionError({message: `getAppToLoggedOutState: ni écran de connexion ni session reconnus (${await currentUrlForLog()})`})
}
