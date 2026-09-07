import EnvironmentPickerPage from './franceconnect/environment-picker.page'
import FranceConnectMirePage from './franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from './franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from './franceconnect/franceconnect-credentials.page'
import HomePage from './home.page'
import {platform} from '../platform'
import type {TestUser} from '../helpers/test-users'
import {getUser} from '../helpers/test-users'
import {grantConsent} from '../helpers/notifications-api'
import logger from '@wdio/logger'
import {AssertionError} from "node:assert";

const log = logger('helper')

// Délai maximal du process complet
const AUTHENTICATE_TIMEOUT_MS = 60000
// borne un simple check de présence (doit rester rapide, ré-exécuté à chaque tentative)
const DETECTION_TIMEOUT_MS = 2000
// FINAL_HOME_TIMEOUT_MS attend une vraie transition asynchrone (redirects OIDC, rendu SPA).
const FINAL_HOME_TIMEOUT_MS = 15000

type FcScreen = 'review-picker' | 'login' | 'eidas' | 'credentials' | 'home'

// L'ordre des étapes et leurs actions associées.
const FC_SCREEN_SEQUENCE: Array<[FcScreen, (user: TestUser) => Promise<void>]> = [
    ['review-picker', (): Promise<void> => EnvironmentPickerPage.reviewEnvironmentPicker()],
    ['login', (): Promise<void> => FranceConnectMirePage.tapFranceConnect(false)],
    ['eidas', async (): Promise<void> => {
        await FranceConnectEidasPage.selectEidasFaible()
    }],
    ['credentials', (user): Promise<void> => FranceConnectCredentialsPage.fillCredentials(user)],
    ['home', async (): Promise<void> => {
    }],
]

/**
 * Cherche l'écran en cours en une requête sur la webview en cours.
 * L'appelant gère les écrans natifs.
 */
async function probeFranceConnectWebScreen(): Promise<FcScreen | null> {
    if (!await platform().isWebContextAvailable()) return null
    return await platform().inWebContext(() =>
        driver.execute(() => {
            // Restreint à <button> : la mire eIDAS de FranceConnect (hors contrôle de l'app AMI)
            // contient elle-même le mot "FranceConnect" dans un lien de pied de page — un simple
            // innerText.includes() sur tout le body matcherait donc aussi cet écran suivant.
            const hasButtonTextIncluding = (needle: string): boolean =>
                Array.from(document.querySelectorAll('button'))
                    .some(b => b.textContent?.toLowerCase().includes(needle))
            if (Array.from(document.querySelectorAll('p'))
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
    ).catch((err: unknown) => {
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
 * A chaque essai, on part de là ou on est et on essaye de finir le process.
 * Un échec ici remonte tel quel à l'appelant,
 */
async function runSequenceFrom(startScreen: FcScreen, user: TestUser): Promise<void> {
    const startIndex = FC_SCREEN_SEQUENCE.findIndex(([screen]) => screen === startScreen)
    for (const [, run] of FC_SCREEN_SEQUENCE.slice(startIndex)) {
        await run(user)
    }
    if (!await HomePage.isHomeVisible(FINAL_HOME_TIMEOUT_MS)) {
        throw new AssertionError({message: 'authenticate: home non atteinte après la séquence'})
    }
}

// Au-delà de ce nombre d'essais, aucune progression n'est possible : la séquence ne comporte
// que FC_SCREEN_SEQUENCE.length écrans distincts, +1 pour absorber un échec ponctuel
// (ex. re-détection après un clic qui n'a pas encore pris effet). Boucler davantage ne fait
// qu'attendre le TIMEOUT pour rien — on préfère échouer vite avec un message clair.
const MAX_ATTEMPTS = FC_SCREEN_SEQUENCE.length + 1

interface AuthenticateOptions {
    // Fournit le consentement partenaire par défaut, y compris si l'utilisateur était déjà
    // authentifié (avant de tous les tests). Mettre à false pour tester un scénario sans
    // consentement AMI.
    grantConsent?: boolean
}

// borne le check initial de présence sur home (doit rester rapide, session déjà ouverte ou non).
const HOME_REACHABLE_TIMEOUT_MS = 1000

/**
 * Amène l'app dans l'état de départ attendu par les tests : connecté et consentement partenaire
 * fourni. Si l'utilisateur est déjà sur la home (session laissée par un test précédent),
 * l'authentification FranceConnect est sautée. Détecte l'écran une fois puis marche la séquence
 * connue jusqu'à la home ; ne redétecte (nouvelle tentative) qu'en cas d'échec — un tour de
 * boucle par échec, pas par écran.
 */
export async function getAppToStartingState({grantConsent: shouldGrantConsent = true}: AuthenticateOptions = {}): Promise<void> {
    const user = getUser('avec_nom_dusage')

    if (!await HomePage.isHomeReachable(HOME_REACHABLE_TIMEOUT_MS)) {
        const deadline = Date.now() + AUTHENTICATE_TIMEOUT_MS
        let lastScreen: FcScreen | null = null
        let attempts = 0
        let authenticated = false

        while (Date.now() < deadline && attempts < MAX_ATTEMPTS) {
            attempts++
            const screen = await detectCurrentScreen()
            if (screen === null) {
                log.warn(`getAppToStartingState: écran non reconnu (dernier connu : ${lastScreen}), tentative de retour vers Home au cas où nous serions déjà connectés (essai ${attempts}/${MAX_ATTEMPTS})`)
                // best-effort : un échec ici est revu par une nouvelle détection au tour suivant.
                await HomePage.goToHomeFromAnywhere(5000).catch(() => {
                })
                continue
            }
            lastScreen = screen
            try {
                await runSequenceFrom(screen, user)
                authenticated = true
                break
            } catch (err) {
                log.warn(`getAppToStartingState: échec depuis l'écran "${screen}", nouvelle tentative (essai ${attempts}/${MAX_ATTEMPTS})`, err)
            }
        }

        if (!authenticated) {
            throw new AssertionError({
                message: `getAppToStartingState: la page d'accueil n'est pas visible après ${attempts} essai(s) (max ${MAX_ATTEMPTS}, ${Date.now() < deadline ? 'limite d\'essais atteinte' : `TIMEOUT ${AUTHENTICATE_TIMEOUT_MS}ms`}, dernier écran détecté : ${lastScreen})`
            })
        }
    }

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
