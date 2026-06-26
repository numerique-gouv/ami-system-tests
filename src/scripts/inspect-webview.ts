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

  console.log(`\n🔌 Connexion à Appium (localhost:4723, ${platform})…`)
  const browser = await remote({
    hostname: 'localhost',
    port: 4723,
    logLevel: 'error',
    capabilities: caps as WebdriverIO.Capabilities,
  })

  // En mode remote() standalone, WDIO n'injecte pas les globaux automatiquement.
  // Les helpers (withWebView, listInteractive, repl…) utilisent driver/browser comme globaux.
  const g = globalThis as Record<string, unknown>
  g.browser = browser
  g.driver  = browser
  g.$       = browser.$.bind(browser)
  g.$$      = browser.$$.bind(browser)

  registerReplHelpers()

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
