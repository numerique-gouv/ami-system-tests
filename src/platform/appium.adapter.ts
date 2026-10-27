import logger from '@wdio/logger'
import type { PlatformAdapter, WebViewTarget } from './types'

const log = logger('page-object')

/**
 * Implémentation mobile (Android/iOS) de PlatformAdapter — logique historiquement
 * dans src/helpers/spa/webview.ts, déplacée ici pour isoler tous les appels Appium
 * (`driver.switchContext`, `driver.getContexts`, gestes natifs) derrière l'interface
 * commune. Voir CLAUDE.md §Architecture et docs/adr/2026-07-09-…
 */

// Une WebView apparaît ~1 s après le choix de l'environnement (mesuré le 2026-10-27, iOS, machine chargée) ; getContexts() coûte ~0,5 s
// (appium:webviewConnectRetries). 15 s suffisent : l'attente de 25 s d'avant n'était perdue que quand l'app était sur un écran natif.
const WEBVIEW_WAIT_MS = 15000
const WEBVIEW_POLL_MS = 500
// Les métadonnées d'un contexte (titre, URL) retardent de plusieurs secondes sur la page réelle (relevé iOS du 2026-10-14) :
// on attend un peu le titre visé avant de se rabattre sur la dernière WebView.
const WEBVIEW_TITLE_WAIT_MS = 5000

/** Une WebView telle que la décrit `getContexts({returnDetailedContexts: true})` (champs utiles aux deux plateformes). */
interface WebViewInfo {
  id: string
  title?: string
  url?: string
  // Android seulement : plusieurs cibles partagent le même `id` (`WEBVIEW_<package>`), seul `webviewPageId` les distingue.
  webviewPageId?: string
  androidWebviewData?: {attached: boolean; visible: boolean}
}

/** Un worker (service worker…) apparaît comme une cible `WEBVIEW_*` de plus : ce n'est pas une page vue par l'utilisateur. */
const isWorker = (webview: WebViewInfo): boolean =>
  /\bworker\b/i.test(webview.title ?? '') || /worker\.js(\?|$)/i.test(webview.url ?? '')

/**
 * Les WebViews candidates, dans l'ordre de la liste : sans le contexte natif ni les workers (s'il n'y a que des workers, on
 * les garde plutôt que rien) ; sur Android, de préférence celles qui sont attachées ET visibles.
 */
async function listWebViews(): Promise<WebViewInfo[]> {
  const contexts = await driver.getContexts({
    returnDetailedContexts: true, isAndroidWebviewVisible: false, returnAndroidDescriptionData: true, waitForWebviewMs: 0,
  } as never) as unknown as WebViewInfo[]
  const webviews = contexts.filter((c) => c.id !== 'NATIVE_APP')
  const pages = webviews.filter((c) => !isWorker(c))
  const candidates = pages.length > 0 ? pages : webviews
  const seen = candidates.filter((c) => !c.androidWebviewData || (c.androidWebviewData.attached && c.androidWebviewData.visible))
  return seen.length > 0 ? seen : candidates
}

const titleMatches = (webview: WebViewInfo, title: string | RegExp): boolean =>
  title instanceof RegExp ? title.test(webview.title ?? '') : (webview.title ?? '').includes(title)

/** Relit la liste des WebViews jusqu'à ce que `ready` soit vrai (ou le délai écoulé : on rend alors la dernière lecture). */
async function waitForWebViews(ready: (webviews: WebViewInfo[]) => boolean, timeout: number): Promise<WebViewInfo[]> {
  let last: WebViewInfo[] = []
  await browser.waitUntil(async () => ready(last = await listWebViews()), {timeout, interval: WEBVIEW_POLL_MS})
    .catch((err: unknown) => log.debug(`waitForWebViews : condition non atteinte en ${timeout}ms`, err))
  return last
}

/**
 * Choisit la WebView à utiliser. Avec un titre : la première dont le titre correspond ; sinon (ou sans cible) la DERNIÈRE de
 * la liste hors workers (la plus récente, donc la plus probablement au premier plan), avec un `log.warn` si un titre était
 * demandé. Lance une erreur technique s'il n'y a aucune WebView.
 */
async function pickWebView(target?: WebViewTarget): Promise<WebViewInfo> {
  let webviews = await waitForWebViews((list) => list.length > 0, WEBVIEW_WAIT_MS)
  if (webviews.length === 0) {
    throw new Error(
      `Aucune WebView trouvée après ${WEBVIEW_WAIT_MS}ms. Vérifier appium:chromedriverAutodownload (Android) ou ` +
      'isInspectable=true (iOS).'
    )
  }
  const title = target?.title
  if (title === undefined) return webviews[webviews.length - 1]

  webviews = await waitForWebViews((list) => list.some((w) => titleMatches(w, title)), WEBVIEW_TITLE_WAIT_MS)
  const found = webviews.find((w) => titleMatches(w, title))
  if (found) return found
  const fallback = webviews[webviews.length - 1]
  log.warn(`inWebContext : aucune WebView au titre ${title} (WebViews : ${webviews.map((w) => `« ${w.title ?? '?'} »`).join(', ')}) ; ` +
    `on prend la dernière hors worker : « ${fallback.title ?? '?'} »`)
  return fallback
}

/** Identifiant du contexte actif (`NATIVE_APP` ou `WEBVIEW_…`). */
async function currentContext(): Promise<string> {
  const current = await driver.getContext()
  return typeof current === 'string' ? current : current.id
}

/** Bascule vers `webview` : par identifiant de contexte (iOS : un par page) ; Android : contexte du package puis page. */
async function switchToWebView(webview: WebViewInfo): Promise<void> {
  await driver.switchContext(webview.id)
  if (webview.webviewPageId) await browser.switchToWindow(webview.webviewPageId)
}

/**
 * Exécute `callback` dans une WebView, puis remet le contexte (et la page) qui étaient actifs à l'entrée. Lance si aucune
 * WebView n'est détectée. `target` désigne la WebView par son titre (cf. `WebViewTarget`).
 *
 * RÉENTRANT, d'après l'état RÉEL du driver (pas un compteur) :
 * - une WebView est déjà active et convient (aucune cible, ou son titre correspond) : `callback` s'y exécute SANS qu'on y
 *   touche, ni à l'entrée ni à la sortie ;
 * - une WebView est active mais la cible en est une autre : on bascule vers la cible, puis on remet la WebView précédente ;
 * - sinon (NATIVE_APP) : on bascule vers la WebView choisie et on remet NATIVE_APP dans un `finally`.
 *
 * Appium expose deux sortes de contextes pour les apps hybrides :
 *   NATIVE_APP  — éléments natifs Android/iOS (UIAutomator2 / XCUITest)
 *   WEBVIEW_*   — contenu web (DOM CSS/XPath, comme dans un navigateur) ; iOS : un contexte par page ; Android : un seul
 *                 contexte par package, plusieurs pages (`webviewPageId`).
 *
 * Sur Android, `appium:chromedriverAutodownload: true` est requis dans les capabilities
 * pour que le context switch réussisse (Chromedriver doit correspondre au WebView embarqué).
 */
async function inWebContext<T>(callback: () => Promise<T>): Promise<T>
async function inWebContext<T>(target: WebViewTarget, callback: () => Promise<T>): Promise<T>
async function inWebContext<T>(targetOrCallback: WebViewTarget | (() => Promise<T>), maybeCallback?: () => Promise<T>): Promise<T> {
  const target = typeof targetOrCallback === 'function' ? undefined : targetOrCallback
  const callback = typeof targetOrCallback === 'function' ? targetOrCallback : maybeCallback as () => Promise<T>

  const previousContext = await currentContext()
  let previousPage: string | undefined
  if (previousContext.startsWith('WEBVIEW_')) {
    const title = target?.title
    if (title === undefined) return await callback()
    // Une WebView est active : si c'est la bonne, on n'y touche pas ; sinon on la quittera, et on y reviendra.
    const activeTitle = await browser.getTitle().catch(() => '')
    if (titleMatches({id: previousContext, title: activeTitle}, title)) return await callback()
    previousPage = await browser.getWindowHandle().catch(() => undefined)
  }

  const webview = await pickWebView(target)
  await switchToWebView(webview)
  let callbackFailed = false
  try {
    // iOS/WKWebView : le scriptTimeout se réinitialise à ~0 ms après chaque switch de contexte.
    // Android/Chromedriver : le défaut est 30 000 ms.
    // Plafond des scripts exécutés dans la page (`execute` / `executeAsync`) : 60 s sur les deux plateformes.
    await browser.setTimeout({ script: 60000 }).catch((err: unknown) => log.warn('inWebContext : setTimeout({script}) a échoué', err))
    // iOS : une fenêtre peut se fermer ou s'ouvrir pendant le flow OIDC (le tab callback se ferme juste après le redirect) ;
    // sans ce step, le driver pointe sur un handle stale ("no such window") : on re-sélectionne le dernier handle.
    // Android : `switchToWebView` a déjà ciblé la page (`webviewPageId`).
    if (driver.isIOS) {
      const handles = await browser.getWindowHandles()
      if (handles.length > 0) await browser.switchToWindow(handles[handles.length - 1])
    }
    return await callback()
  } catch (err) {
    callbackFailed = true
    throw err
  } finally {
    try {
      await driver.switchContext(previousContext)
      if (previousPage) await browser.switchToWindow(previousPage)
    } catch (err) {
      // Le contexte reste alors WEBVIEW_* : les requêtes natives suivantes échoueront (« Unsupported locator
      // strategy: -ios predicate string »). On le trace, et on ne masque jamais l'erreur d'origine du callback.
      log.error(`inWebContext : retour au contexte ${previousContext} impossible, la session reste en WebView`, err)
      if (!callbackFailed) throw err
    }
  }
}

async function isWebContextAvailable(): Promise<boolean> {
  const contexts = await driver.getContexts() as string[]
  return contexts.some((c) => c.startsWith('WEBVIEW_'))
}

/**
 * Force le recalcul de l'arbre d'accessibilité WKWebView sur iOS.
 *
 * Symptôme corrigé : après un redirect OIDC (ex. page eIDAS → FCP-LOW), `$(selector)`
 * retourne "not found" alors que la page est visuellement rendue — WKWebView en mode
 * automation interroge un AX tree périmé jusqu'à ce qu'un trigger force la re-sync.
 */
async function refreshAxTree(): Promise<void> {
  if (!driver.isIOS) return
  // getPageSource() sérialise le DOM courant via WKRDP et invalide le snapshot AX périmé.
  // driver.execute(() => 0) seul est insuffisant — il fait un round-trip WKRDP sans forcer
  // la re-sérialisation de l'arbre d'accessibilité après un redirect de page.
  try {
    await driver.getPageSource()
  } catch (err) {
    // Best-effort : l'échec du rafraîchissement n'est pas bloquant, mais il est tracé.
    log.warn('refreshAxTree : getPageSource a échoué', err)
  }
}

/**
 * Geste natif vers le bas pour déclencher le SwipeRefreshLayout Android.
 * Doit être appelé hors inWebContext : le geste est intercepté par la WebView
 * si on est en contexte WebView, et n'atteint pas le conteneur natif.
 * Sur iOS, préférer `driver.execute(() => window.location.reload())` en WebView —
 * un `UIRefreshControl` peut bloquer ce geste de swipe.
 */
async function pullToRefresh(): Promise<void> {
  const { width, height } = await driver.getWindowSize()
  await driver.action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25) })
    .down({ button: 0 })
    .move({ duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65) })
    .up({ button: 0 })
    .perform()
}

export const appiumAdapter: PlatformAdapter = {
  get kind() {
    return driver.isIOS ? 'ios' : 'android'
  },
  get fcButtonIsNative() {
    return !driver.isIOS
  },
  inWebContext,
  isWebContextAvailable,
  refreshAxTree,
  pullToRefresh,
}
