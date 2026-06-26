/**
 * Script d'inspection interactive d'une app AMI ouverte sur un appareil/simulateur.
 *
 * Appelé par `just inspect [hash]` — Appium est déjà démarré sur le port 4723
 * par le justfile avant l'appel à ce script.
 *
 * Usage :
 *   just inspect                    → liste les éléments et ouvre le REPL
 *   just inspect /notifications     → navigue vers /#/notifications avant d'inspecter
 */

import nodeRepl from 'node:repl'
import { remote } from 'webdriverio'
import { androidCapabilities, iosCapabilities } from '../driver/capabilities'
import { listInteractiveAll, getContexts, saveScreenshot, webViewInfo } from '../helpers/repl'
import { withWebView, refreshAxTree, tl } from '../helpers/webview'
import { listInteractive } from '../helpers/inspect'

const [,, platform] = process.argv

async function main(): Promise<void> {
  const baseCaps = platform === 'ios' ? iosCapabilities : androidCapabilities

  // Retirer les capabilities qui relancent ou terminent l'app :
  //   - 'appium:app'              → déclenche une vérification d'installation + lancement depuis le .apk/.app
  //   - 'appium:appActivity'      → Android : navigue vers MainActivity au démarrage de session
  //   - 'appium:shouldTerminateApp' → iOS : termine l'app avant de s'y attacher
  // Sans appActivity/shouldTerminateApp, Appium s'attache à l'app déjà au premier plan.
  const caps = { ...(baseCaps as Record<string, unknown>) }
  delete caps['appium:app']
  delete caps['appium:appActivity']
  delete caps['appium:shouldTerminateApp']
  caps['appium:noReset'] = true
  caps['appium:fullReset'] = false

  // eslint-disable-next-line no-console
  console.log(`\n🔌 Connexion à Appium (localhost:4723, ${platform})…`)
  const browser = await remote({
    hostname: 'localhost',
    port: 4723,
    logLevel: 'error',
    capabilities: caps as WebdriverIO.Capabilities,
  })

  // useGlobal: true : le REPL utilise le scope global Node.js, ce qui active le
  // top-level `await` natif. Les helpers sont exposés sur globalThis pour y être accessibles.
  const g = globalThis as Record<string, unknown>
  g.browser = browser
  g.driver  = browser
  g.$       = browser.$.bind(browser)
  g.$$      = browser.$$.bind(browser)
  g.listInteractive    = listInteractive
  g.listInteractiveAll = listInteractiveAll
  g.withWebView        = withWebView
  g.webViewInfo        = webViewInfo
  g.refreshAxTree      = refreshAxTree
  g.getContexts        = getContexts
  g.saveScreenshot     = saveScreenshot
  g.tl                 = tl
  g.help               = showHelp

  // eslint-disable-next-line no-console
  console.log('\n📋 Éléments interactifs :\n')
  await listInteractiveAll()

  function showHelp(): void {
    // eslint-disable-next-line no-console
    console.log(`
Helpers disponibles dans ce REPL :

  help()                         — affiche ce message
  await listInteractive()        — éléments du contexte courant (natif ou webview)
  await listInteractiveAll()     — natif + webview en un appel
  await withWebView(async () =>  — exécuter une action dans le contexte WebView
    { ... })
  await webViewInfo()            — { url, visible, title } de la WebView active
  await refreshAxTree()          — force le re-scan accessibilité (iOS)
  await getContexts()            — liste les contextes Appium
  await saveScreenshot('name')   — sauve /tmp/name.png

  tl()                           — Testing Library (à utiliser dans withWebView)
    ex : await withWebView(async () => {
           const el = await tl().findByText('Mon texte')
           console.log(await el.getText())
         })

  $('selector')                  — WDIO $ (accès direct)
  $$('selector')                 — WDIO $$ (liste)
  browser / driver               — session Appium en cours

Voir docs/guidelines/interactive-debugging.md pour les recettes.\n`)
  }

  // eslint-disable-next-line no-console
  console.log('\n💡 REPL ouvert — taper help() pour voir les helpers disponibles.\n')

  // useGlobal: true → le REPL partage le scope global Node.js (pas de contexte vm isolé).
  // Avantage : top-level await est géré nativement par Node.js (enveloppé en async IIFE).
  // Inconvénient acceptable : les `var` déclarés dans le REPL polluent le global — sans
  // importance en session d'inspection.
  const replServer = nodeRepl.start({
    prompt: 'wdio> ',
    useGlobal: true,
  })

  await new Promise<void>(resolve => replServer.on('exit', resolve))

  await browser.deleteSession()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
