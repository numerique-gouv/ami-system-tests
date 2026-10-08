import EnvironmentPickerPage from './franceconnect/environment-picker.page'
import FranceConnectMirePage, {FranceConnectProviderError} from './franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from './franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from './franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from './onboarding-passkey.page'
import OnboardingZonesPage from './onboarding-zones.page'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import HomePage from './home.page'
import {platform} from '../platform'
import type {TestUser} from '../helpers/test-users'
import {getUser} from '../helpers/test-users'
import {grantConsent} from '../helpers/notifications-api'
import {currentUrlForLog, hasSessionToken, openAppRoot} from '../helpers/session'
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
// borne un simple check de présence (doit rester rapide, ré-exécuté à chaque tentative)
const DETECTION_TIMEOUT_MS = 2000
// Sondes rapides du tour de boucle : l'accueil (« Bonjour ») et chaque page d'onboarding. La sortie normale
// est l'accueil ; on n'attend donc pas une page qui n'est pas là.
const HOME_PROBE_MS = 500
const ONBOARDING_PROBE_MS = 500
// Rien de reconnu (ni accueil, ni onboarding, ni écran de connexion) pendant ce délai : on recharge la racine
// de l'app une fois. Assez long pour laisser finir une redirection en cours (ex. fin de session FranceConnect).
const UNRECOGNIZED_BEFORE_ROOT_MS = 15000

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
const ONBOARDING_PAGES: Array<{name: string, isVisible: () => Promise<boolean>, dismiss: () => Promise<void>}> = [
    {name: 'passkey', isVisible: () => OnboardingPasskeyPage.isVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingPasskeyPage.dismiss()},
    {name: 'zones', isVisible: () => OnboardingZonesPage.isVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingZonesPage.dismiss()},
    {name: 'notifications', isVisible: () => OnboardingNotificationsPage.isOnboardingVisible(ONBOARDING_PROBE_MS), dismiss: () => OnboardingNotificationsPage.dismiss()},
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
    for (const [, run] of CONNECTION_SEQUENCE.slice(startIndex)) {
        await run(user)
    }
}

/**
 * Ferme la première page d'onboarding affichée. `true` si une page a été fermée (il faut alors réobserver).
 * `dismissals` compte les fermetures par page : une page qui revient sans cesse est une anomalie à signaler.
 */
async function dismissOnboardingPage(dismissals: Map<string, number>): Promise<boolean> {
    for (const page of ONBOARDING_PAGES) {
        if (!await page.isVisible()) continue
        const count = (dismissals.get(page.name) ?? 0) + 1
        if (count > MAX_DISMISSALS_PER_PAGE)
            throw new AssertionError({message: `getAppToStartingState: la page d'onboarding « ${page.name} » revient après ${MAX_DISMISSALS_PER_PAGE} fermetures (${await currentUrlForLog()})`})
        dismissals.set(page.name, count)
        log.info(`getAppToStartingState: onboarding « ${page.name} » affiché, fermeture (${count}/${MAX_DISMISSALS_PER_PAGE})`)
        await page.dismiss()
        return true
    }
    return false
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
        if (await platform().isWebContextAvailable()) {
            if (await HomePage.isHomeDisplayed(HOME_PROBE_MS)) return

            if (await dismissOnboardingPage(dismissals)) {
                unrecognizedSince = null
                lastProgressAt = Date.now()
                continue
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
        if (!rootOpened && Date.now() - unrecognizedSince > UNRECOGNIZED_BEFORE_ROOT_MS) {
            rootOpened = true
            log.warn(`ANOMALIE : page non reconnue depuis ${UNRECOGNIZED_BEFORE_ROOT_MS}ms (${await currentUrlForLog()}), rechargement de la racine de l'app.`)
            await openAppRoot().catch((err: unknown) => log.warn('getAppToStartingState: rechargement de la racine impossible', err))
        }
    }

    throw new AssertionError({
        message: `getAppToStartingState: l'accueil n'est pas atteint (${Math.round((Date.now() - lastProgressAt) / 1000)}s sans progrès, ${Math.round((Date.now() - startedAt) / 1000)}s au total, ${await currentUrlForLog()})`
    })
}

interface AuthenticateOptions {
    // Fournit le consentement partenaire par défaut, y compris si l'utilisateur était déjà
    // authentifié (avant tous les tests). Mettre à false pour tester un scénario sans
    // consentement AMI.
    grantConsent?: boolean
}

/**
 * Remet l'app dans l'état de départ attendu par les tests : connecté, sur l'accueil, consentement partenaire
 * fourni. Chaque test (sauf l'authentification) commence par là : le test précédent a pu s'arrêter
 * n'importe où dans l'app.
 *
 * 1. Cookie de session présent → chargement de la racine de l'app (la SPA route vers l'accueil).
 * 2. Absent → rien n'est touché : la boucle déroule la connexion (sélecteur d'environnement, FranceConnect,
 *    eIDAS, identifiants) à partir de l'écran affiché.
 * 3. Jusqu'à l'accueil (« Bonjour »), les pages d'onboarding connues sont fermées.
 * 4. L'URL d'arrivée est journalisée.
 */
export async function getAppToStartingState({grantConsent: shouldGrantConsent = true}: AuthenticateOptions = {}): Promise<void> {
    const user = getUser('avec_nom_dusage')

    if (await hasSessionToken()) {
        log.info('getAppToStartingState: session ouverte, chargement de la racine de l\'app')
        await openAppRoot()
    } else {
        log.info('getAppToStartingState: pas de session lisible, connexion depuis l\'écran affiché')
    }
    await reachHome(user)
    log.info(`getAppToStartingState: état de départ atteint, URL : ${await currentUrlForLog()}`)

    // Échec permanent (pas lié à l'écran) : remonte tel quel à l'appelant, sans retenter la séquence.
    if (shouldGrantConsent) {
        try {
            await grantConsent(user.fcHash)
            log.info(`getAppToStartingState: consentement partenaire fourni avec succès (fc_hash: ${user.fcHash})`)
        } catch (err) {
            log.error(`getAppToStartingState: échec de la fourniture du consentement partenaire (fc_hash: ${user.fcHash})`, err)
            throw err
        }
    } else {
        log.info(`getAppToStartingState: consentement partenaire non fourni (grantConsent: false, fc_hash: ${user.fcHash})`)
    }
}
