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

import { remote } from 'webdriverio'
import { androidCapabilities, iosCapabilities } from '../driver/capabilities'
import { registerReplHelpers, listInteractiveAll } from '../helpers/repl'
import { withWebView } from '../helpers/webview'

const [,, platform, hash] = process.argv

async function main(): Promise<void> {
  const baseCaps = platform === 'ios' ? iosCapabilities : androidCapabilities

  console.log(`\n🔌 Connexion à Appium (localhost:4723, ${platform})…`)
  const browser = await remote({
    hostname: 'localhost',
    port: 4723,
    logLevel: 'error',
    capabilities: {
      ...baseCaps,
      // Mode inspection : garder l'état de l'app, ne pas réinstaller
      'appium:noReset': true,
      'appium:fullReset': false,
    },
  })

  // En mode remote() standalone, WDIO n'injecte pas les globaux automatiquement.
  // Les helpers (withWebView, listInteractive, repl…) utilisent driver/browser comme globaux.
  const g = globalThis as Record<string, unknown>
  g.browser = browser
  g.driver  = browser
  g.$       = browser.$.bind(browser)
  g.$$      = browser.$$.bind(browser)

  registerReplHelpers()

  if (hash) {
    console.log(`\n🔗 Navigation vers ${hash}…`)
    try {
      await withWebView(async () => {
        await browser.execute((h: string) => { window.location.hash = h }, hash)
        await browser.pause(800)
      })
    } catch (e) {
      console.warn(`⚠️  Navigation échouée : ${(e as Error).message}`)
    }
  }

  console.log('\n📋 Éléments interactifs :\n')
  await listInteractiveAll()

  console.log('\n💡 REPL ouvert — taper help() pour voir les helpers disponibles.\n')
  await browser.debug()

  await browser.deleteSession()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
