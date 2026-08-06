import type { PlatformAdapter } from './types'

/**
 * Implémentation webapp de PlatformAdapter : la session WebdriverIO est un Chrome
 * classique pointé directement sur la SPA (pas d'Appium, pas de contexte natif à
 * basculer) — la plupart des membres sont donc des no-op ou l'identité.
 */

// Handle de l'onglet de la SPA, capturé une fois par captureAppWindow() (appelé depuis le
// before() de wdio.webapp.conf.ts juste après la navigation initiale). Un window handle W3C
// reste stable pour tout l'onglet tant qu'il n'est pas fermé — y compris lors des navigations
// cross-origin du flow OIDC (FranceConnect et, derrière, les IdP partenaires : DN, CNSM, OTC…).
// Revenir à un handle connu est donc plus robuste que deviner l'appartenance d'une URL à
// l'app : la liste des domaines partenaires n'est pas connue à l'avance, contrairement au
// domaine de la SPA elle-même.
let appWindowHandle: string | undefined

/**
 * Mémorise l'onglet courant comme onglet de la SPA. À appeler une seule fois, juste après la
 * navigation initiale vers baseUrl (avant qu'un flow OIDC ne puisse ouvrir d'autres onglets).
 */
export async function captureAppWindow(): Promise<void> {
  appWindowHandle = await browser.getWindowHandle()
}

// Un onglet dont le débogueur JS est en pause (breakpoint actif, "Pause on exceptions" dans
// Chrome DevTools ouvert sur CET onglet) bloque indéfiniment toute commande WebDriver qui
// nécessite d'exécuter du script (getWindowHandle, execute…) — CDP attend que le debugger
// reprenne la main. Un timeout court transforme ce blocage silencieux (observé : la session
// entière reste figée jusqu'au timeout Mocha, 108-180s, sans le moindre indice) en erreur
// immédiate et explicite. Seul ensureAppWindow() est borné ainsi, pas le `callback` de
// inWebContext() : ce dernier peut légitimement prendre plusieurs dizaines de secondes
// (ex. attente de notification, cf. NOTIF_DELIVERY_TIMEOUT_MS dans notifications.page.ts).
const ENSURE_APP_WINDOW_TIMEOUT_MS = 20000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

/**
 * Rebascule vers l'onglet de la SPA si la fenêtre courante n'est pas celle capturée.
 *
 * Symétrique à la re-sélection de window handle d'appium.adapter.ts après un redirect OIDC :
 * un partenaire (FranceConnect, DN, CNSM, OTC…) peut ouvrir sa propre navigation dans un
 * nouvel onglet plutôt qu'une navigation plein-page. Sans ce garde-fou, `driver.execute()`
 * s'exécuterait silencieusement contre le mauvais onglet (potentiellement bloqué indéfiniment)
 * au lieu de lever une erreur claire.
 */
async function ensureAppWindow(): Promise<void> {
  await withTimeout(
    doEnsureAppWindow(),
    ENSURE_APP_WINDOW_TIMEOUT_MS,
    `ensureAppWindow() n'a pas répondu après ${ENSURE_APP_WINDOW_TIMEOUT_MS}ms. Causes probables : ` +
    "l'onglet testé a un débogueur JS en pause (breakpoint actif ou 'Pause on exceptions' dans " +
    "Chrome DevTools ouvert sur CET onglet) — reprenez l'exécution ou fermez DevTools sur l'onglet " +
    "de l'application avant de relancer."
  )
}

async function doEnsureAppWindow(): Promise<void> {
  if (!appWindowHandle) return // captureAppWindow() pas encore appelé (avant la navigation initiale) — rien à faire

  const current = await browser.getWindowHandle().catch(() => undefined)
  if (current === appWindowHandle) return

  const handles = await browser.getWindowHandles()
  if (!handles.includes(appWindowHandle)) {
    throw new Error(
      `L'onglet de la SPA (handle "${appWindowHandle}") a disparu parmi les ${handles.length} ` +
      "fenêtre(s) ouverte(s) — fermé entre-temps ?"
    )
  }
  await browser.switchToWindow(appWindowHandle)
}

export const browserAdapter: PlatformAdapter = {
  kind: 'webapp',
  fcButtonIsNative: false,

  async inWebContext<T>(callback: () => Promise<T>): Promise<T> {
    await ensureAppWindow()
    return await callback()
  },

  async isWebContextAvailable(): Promise<boolean> {
    return true
  },

  async refreshAxTree(): Promise<void> {
    // Pas d'arbre d'accessibilité Appium à re-synchroniser hors Appium.
  },

  async pullToRefresh(): Promise<void> {
    await browser.refresh()
  },
}
