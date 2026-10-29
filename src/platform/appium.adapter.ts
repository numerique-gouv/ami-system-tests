import {isUnambiguous, lastVisible} from '../helpers/spa/webview-choice'
import type { ContextKind, PlatformAdapter, WebViewTarget } from './types'

const WEBVIEW_WAIT_MS = 15000
const WEBVIEW_POLL_MS = 500
const WEBVIEW_TITLE_WAIT_MS = 5000

interface WebViewInfo {
  id: string
  title?: string
  url?: string
  webviewPageId?: string
  androidWebviewData?: {attached: boolean; visible: boolean}
}

const isWorker = (webview: WebViewInfo): boolean =>
  /\bworker\b/i.test(webview.title ?? '') || /worker\.js(\?|$)/i.test(webview.url ?? '')

/** Les WebViews candidates, sans le contexte natif ni les workers ; sur Android, de préférence celles attachées et visibles. */
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

/** Relit les WebViews jusqu'à `ready` ou la fin du délai, et rend la dernière lecture. */
async function waitForWebViews(ready: (webviews: WebViewInfo[]) => boolean, timeout: number): Promise<WebViewInfo[]> {
  let last: WebViewInfo[] = []
  await browser.waitUntil(async () => ready(last = await listWebViews()), {timeout, interval: WEBVIEW_POLL_MS})
    .catch(() => undefined)
  return last
}

/** La dernière WebView, ou s'il y en a plusieurs la dernière réellement visible (`document.visibilityState`). Le choix pur est dans `lastVisible`. */
async function lastVisibleWebView(webviews: WebViewInfo[]): Promise<WebViewInfo> {
  if (webviews.length < 2) return webviews[webviews.length - 1]
  const readVisibilities = async (): Promise<boolean[]> => {
    const visibilities: boolean[] = []
    for (const webview of webviews) {
      await switchToWebView(webview)
      visibilities.push(await browser.execute(() => document.visibilityState).catch(() => 'visible') === 'visible')
    }
    return visibilities
  }
  // Au retour d'arrière-plan, aucune WebView n'est visible, puis parfois deux : on attend qu'il n'en reste qu'une.
  let visibilities = await readVisibilities()
  await browser.waitUntil(async () => isUnambiguous(visibilities = await readVisibilities()), {timeout: 8000, interval: 500}).catch(() => undefined)
  return lastVisible(webviews, visibilities) as WebViewInfo
}

/** Avec un titre : la première WebView qui correspond ; sinon la dernière hors workers. Lève une erreur technique s'il n'y en a aucune. */
async function pickWebView(target?: WebViewTarget): Promise<WebViewInfo> {
  let webviews = await waitForWebViews((list) => list.length > 0, WEBVIEW_WAIT_MS)
  if (webviews.length === 0) {
    throw new Error(`Aucune WebView trouvée après ${WEBVIEW_WAIT_MS}ms`)
  }
  const title = target?.title
  if (title === undefined) return await lastVisibleWebView(webviews)

  webviews = await waitForWebViews((list) => list.some((w) => titleMatches(w, title)), WEBVIEW_TITLE_WAIT_MS)
  const found = webviews.find((w) => titleMatches(w, title))
  if (found) return found
  return webviews[webviews.length - 1]
}

// Une session Appium démarre sur NATIVE_APP.
let known: {session: string, context: string} | undefined

function remember(context: string): void {
  known = {session: driver.sessionId, context}
}

function context(): ContextKind {
  const current = known?.session === driver.sessionId ? known.context : 'NATIVE_APP'
  return current.startsWith('WEBVIEW') ? 'web' : 'native'
}

async function currentContext(): Promise<string> {
  const current = await driver.getContext()
  const id = typeof current === 'string' ? current : current.id
  remember(id)
  return id
}

async function syncContext(): Promise<ContextKind> {
  await currentContext()
  return context()
}

/** iOS : un contexte par page ; Android : contexte du package puis page. */
async function switchToWebView(webview: WebViewInfo): Promise<void> {
  await driver.switchContext(webview.id)
  remember(webview.id)
  if (webview.webviewPageId) await browser.switchToWindow(webview.webviewPageId)
}

/**
 * Exécute `callback` dans une WebView, puis remet le contexte (et la page) d'origine. Réentrant d'après l'état réel du driver :
 * une WebView déjà active qui convient n'est pas touchée ; une autre WebView active est quittée puis retrouvée ; depuis NATIVE_APP, on bascule
 * vers la WebView choisie et on remet NATIVE_APP dans un `finally`.
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
    // Le scriptTimeout iOS retombe à ~0 ms à chaque changement de contexte.
    await browser.setTimeout({ script: 60000 }).catch(() => undefined)
    if (driver.isIOS) {
      const handles = await browser.getWindowHandles()
      // Le handle de la WebView choisie (`<pid>.<n>`, comme son contexte), à défaut le dernier : l'ancien peut être périmé après un flow OIDC.
      const wanted = webview.id.replace(/^WEBVIEW_/, '')
      if (handles.length > 0) await browser.switchToWindow(handles.includes(wanted) ? wanted : handles[handles.length - 1])
    }
    return await callback()
  } catch (err) {
    callbackFailed = true
    throw err
  } finally {
    try {
      await driver.switchContext(previousContext)
      remember(previousContext)
      if (previousPage) await browser.switchToWindow(previousPage)
    } catch (err) {
      // On ne masque jamais l'erreur d'origine du callback.
      if (!callbackFailed) throw err
    }
  }
}

async function isWebContextAvailable(): Promise<boolean> {
  // getContexts rejoue la recherche des pages : inutile dans une WebView déjà active.
  if ((await currentContext()).startsWith('WEBVIEW_')) return true
  const contexts = await driver.getContexts() as string[]
  return contexts.some((c) => c.startsWith('WEBVIEW_'))
}

async function refreshAxTree(): Promise<void> {
  if (!driver.isIOS) return
  await driver.getPageSource().catch(() => undefined)
}

/** Geste natif vers le bas (SwipeRefreshLayout Android), à appeler hors inWebContext. */
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
  context,
  syncContext,
  inWebContext,
  isWebContextAvailable,
  refreshAxTree,
  pullToRefresh,
}
