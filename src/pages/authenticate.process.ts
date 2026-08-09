import EnvironmentPickerPage from './franceconnect/environment-picker.page'
import FranceConnectMirePage from './franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from './franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from './franceconnect/franceconnect-credentials.page'
import HomePage from './home.page'
import {platform} from '../platform'
import type {TestUser} from '../helpers/test-users'
import {getUser} from '../helpers/test-users'
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
  ['eidas', async (): Promise<void> => { await FranceConnectEidasPage.selectEidasFaible() }],
  ['credentials', (user): Promise<void> => FranceConnectCredentialsPage.fillCredentials(user)],
  ['home', async (): Promise<void> => {}],
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
      if (document.body.innerText.includes("Fournisseur d'identité de démonstration - FCP-LOW"))
        return 'credentials'
      return null
    }) as Promise<FcScreen | null>
  ).catch(() => null)
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

/**
 * Authentifie l'utilisateur de test, quel que soit l'écran de départ. Détecte l'écran une fois
 * puis marche la séquence connue jusqu'à la home ; ne redétecte (nouvelle tentative) qu'en cas
 * d'échec — un tour de boucle par échec, pas par écran.
 */
export async function authenticate(): Promise<void> {
  const user = getUser('avec_nom_dusage')
  const deadline = Date.now() + AUTHENTICATE_TIMEOUT_MS
  let lastScreen :FcScreen|null = null

  while (Date.now() < deadline) {
    const screen = await detectCurrentScreen()
    if (screen === null) {
      log.warn(`authenticate: écran non reconnu (dernier connu : ${lastScreen}), tentative de retour vers Home au cas où nous serions déjà connectés`)
      // best-effort : un échec ici est revu par une nouvelle détection au tour suivant.
      await HomePage.goToHomeFromAnywhere(5000).catch(() => {})
      continue
    }
    lastScreen = screen
    try {
      await runSequenceFrom(screen, user)
      return
    } catch (err) {
      log.warn(`authenticate: échec depuis l'écran "${screen}", nouvelle tentative`, err)
    }
  }
  throw new AssertionError({
    message: `authenticate: la page d'accueil n'est pas visible après ${AUTHENTICATE_TIMEOUT_MS}ms (dernier écran détecté : ${lastScreen})`
  })
}
