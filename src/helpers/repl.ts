/**
 * Helpers exposés sur globalThis pendant une session browser.debug().
 *
 * Tout ce qui est enregistré ici via `register()` devient appelable directement
 * dans le REPL (sans `driver.` ni import) et apparaît dans `help()`.
 *
 * Voir guidelines/interactive-debugging.md pour les recettes d'usage.
 */

import fs from 'fs'
import path from 'path'
import { listInteractive } from './inspect'
import { withWebView, refreshAxTree } from './webview'

type ReplHelper = {
  name: string
  signature: string
  description: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => unknown
}

const HELPERS: ReplHelper[] = []

function register(helper: ReplHelper): void {
  HELPERS.push(helper)
}

/**
 * Retourne la liste des contextes Appium actifs (NATIVE_APP + WEBVIEW_* éventuels).
 * Raccourci typable sans le préfixe `driver.`.
 */
async function getContexts(): Promise<string[]> {
  return (await driver.getContexts()) as string[]
}

/**
 * Sauve un screenshot du device dans /tmp/<name>.png (défaut : debug-<timestamp>.png).
 * Affiche et retourne le chemin pour faciliter le `open` dans le terminal.
 */
async function saveScreenshot(name?: string): Promise<string> {
  const png = await browser.takeScreenshot()
  const filename = `${name ?? `debug-${Date.now()}`}.png`
  const filepath = path.join('/tmp', filename)
  fs.writeFileSync(filepath, Buffer.from(png, 'base64'))
  // eslint-disable-next-line no-console
  console.log(`Screenshot → ${filepath}`)
  return filepath
}

/**
 * Inspecte la WebView : URL chargée, visibilité réelle (vs cachée derrière un overlay
 * natif) et titre. Throw si aucune WebView vivante dans le process.
 */
async function webViewInfo(): Promise<{ url: string; visible: string; title: string }> {
  return await withWebView(async () => ({
    url: await browser.getUrl(),
    visible: (await driver.execute(() => document.visibilityState)) as string,
    title: (await driver.execute(() => document.title)) as string,
  }))
}

/**
 * Liste les éléments interactifs en NATIVE puis en WEBVIEW (si dispo).
 * Pratique sur un écran hybride pour voir d'un coup ce qui est ciblable des deux côtés.
 */
async function listInteractiveAll(): Promise<{
  native: Awaited<ReturnType<typeof listInteractive>>
  webview: Awaited<ReturnType<typeof listInteractive>> | null
}> {
  // eslint-disable-next-line no-console
  console.log('=== NATIVE ===')
  const native = await listInteractive()
  // eslint-disable-next-line no-console
  console.log('=== WEBVIEW ===')
  try {
    const webview = await withWebView(async () => await listInteractive())
    return { native, webview }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`(WebView indisponible : ${(e as Error).message})`)
    return { native, webview: null }
  }
}

/**
 * Affiche dynamiquement la liste des helpers REPL enregistrés.
 */
function help(): void {
  // eslint-disable-next-line no-console
  console.log('\nHelpers REPL disponibles (browser.debug()) :\n')
  const sigWidth = Math.max(...HELPERS.map((h) => h.signature.length))
  for (const h of HELPERS) {
    // eslint-disable-next-line no-console
    console.log(`  ${h.signature.padEnd(sigWidth)}  — ${h.description}`)
  }
  // eslint-disable-next-line no-console
  console.log('\nVoir guidelines/interactive-debugging.md pour les recettes.\n')
}

register({
  name: 'help',
  signature: 'help()',
  description: 'Liste ces helpers',
  fn: help,
})
register({
  name: 'listInteractive',
  signature: 'await listInteractive()',
  description: 'Liste les éléments du contexte courant (natif ou webview)',
  fn: listInteractive,
})
register({
  name: 'listInteractiveAll',
  signature: 'await listInteractiveAll()',
  description: 'Liste natif puis webview en un appel',
  fn: listInteractiveAll,
})
register({
  name: 'withWebView',
  signature: 'await withWebView(async () => …)',
  description: 'Exécute le callback dans le contexte WEBVIEW_* puis restaure NATIVE_APP',
  fn: withWebView,
})
register({
  name: 'webViewInfo',
  signature: 'await webViewInfo()',
  description: '{ url, visible, title } — vérifie qu\'une WebView est vraiment visible',
  fn: webViewInfo,
})
register({
  name: 'refreshAxTree',
  signature: 'await refreshAxTree()',
  description: 'Force le re-scan de l\'arbre d\'accessibilité (iOS uniquement)',
  fn: refreshAxTree,
})
register({
  name: 'getContexts',
  signature: 'await getContexts()',
  description: 'Liste les contextes Appium (raccourci de driver.getContexts())',
  fn: getContexts,
})
register({
  name: 'saveScreenshot',
  signature: 'await saveScreenshot(name?)',
  description: 'Sauve un PNG dans /tmp/<name>.png (défaut : debug-<timestamp>.png)',
  fn: saveScreenshot,
})

/**
 * Enregistre tous les helpers sur globalThis pour qu'ils soient accessibles dans
 * le REPL ouvert par `await browser.debug()`. Appelé depuis le hook `before:` de
 * `wdio.base.conf.ts`.
 */
export function registerReplHelpers(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  for (const h of HELPERS) {
    g[h.name] = h.fn
  }
}
