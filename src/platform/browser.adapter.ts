import type { PlatformAdapter, WebViewTarget } from './types'

// Handle W3C de l'onglet de la SPA : stable tant que l'onglet n'est pas fermé, y compris pendant les navigations cross-origin du flow OIDC.
let appWindowHandle: string | undefined

/** À appeler une fois, juste après la navigation initiale vers baseUrl. */
export async function captureAppWindow(): Promise<void> {
  appWindowHandle = await browser.getWindowHandle()
}

// Borne ensureAppWindow() seul : le `callback` d'inWebContext peut légitimement durer des dizaines de secondes.
const ENSURE_APP_WINDOW_TIMEOUT_MS = 20000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

/** Rebascule vers l'onglet de la SPA si un partenaire a ouvert son flow dans un autre. */
async function ensureAppWindow(): Promise<void> {
  await withTimeout(doEnsureAppWindow(), ENSURE_APP_WINDOW_TIMEOUT_MS, `ensureAppWindow() sans réponse après ${ENSURE_APP_WINDOW_TIMEOUT_MS}ms`)
}

async function doEnsureAppWindow(): Promise<void> {
  if (!appWindowHandle) return

  const current = await browser.getWindowHandle().catch(() => undefined)
  if (current === appWindowHandle) return

  const handles = await browser.getWindowHandles()
  if (!handles.includes(appWindowHandle)) {
    throw new Error(`L'onglet de la SPA a disparu (${handles.length} fenêtre(s) ouverte(s))`)
  }
  await browser.switchToWindow(appWindowHandle)
}

export const browserAdapter: PlatformAdapter = {
  kind: 'webapp',
  fcButtonIsNative: false,

  async inWebContext<T>(targetOrCallback: WebViewTarget | (() => Promise<T>), maybeCallback?: () => Promise<T>): Promise<T> {
    // Une seule page : la cible est sans objet.
    const callback = typeof targetOrCallback === 'function' ? targetOrCallback : maybeCallback as () => Promise<T>
    await ensureAppWindow()
    return await callback()
  },

  async isWebContextAvailable(): Promise<boolean> {
    return true
  },

  async refreshAxTree(): Promise<void> {},

  async pullToRefresh(): Promise<void> {
    await browser.refresh()
  },
}
