import { execFileSync } from 'child_process'
import path from 'path'
import type { Options } from '@wdio/types'
import logger from '@wdio/logger'
import { baseConfig } from './wdio.base.conf'
import { iosCapabilities } from './src/driver/capabilities'
import { resolveSpecs } from './test-suites'

const APP_ID = iosCapabilities['appium:bundleId'] as string
const log = logger('config')

export const config: Options.Testrunner = {
  ...baseConfig,

  specs: resolveSpecs(path.resolve(__dirname, 'src/tests/mobile/**/*.test.ts')),

  capabilities: [iosCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: 4724, // port différent pour éviter tout conflit avec Android
          relaxedSecurity: false,
          log: '.wdio-logs/appium-ios.log',
        },
      },
    ],
  ],

  port: 4724,

  // Réinitialise la session FranceConnect et le conteneur data de l'app avant chaque run.
  // Équivalent de _reset-ios-fc-session dans le justfile, exécuté une seule fois avant tout worker.
  // Un effacement partiel (WebKit/cookies seuls) laisse l'app dans un état incohérent
  // où la WKWebView se reconnecte sans afficher la mire FC.
  onPrepare(): void {
    const udid = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf-8' })
      .match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i)?.[0]
    if (!udid) {
      log.warn('onPrepare : aucun simulateur iOS démarré — reset FC ignoré.')
      return
    }
    const sim = (args: string[]): void => { try { execFileSync('xcrun', ['simctl', ...args], { stdio: 'ignore' }) } catch {} }
    sim(['privacy', udid, 'reset', 'notifications', APP_ID])
    sim(['spawn', udid, 'defaults', 'delete', 'com.apple.SafariViewService'])
    sim(['spawn', udid, 'rm', '-rf', '/Library/Caches/com.apple.SafariViewService'])
    sim(['spawn', udid, 'rm', '-f', '/var/mobile/Library/Cookies/com.apple.SafariViewService.binarycookies'])
    try {
      const container = execFileSync('xcrun', ['simctl', 'get_app_container', udid, APP_ID, 'data'], { encoding: 'utf-8' }).trim()
      if (container) execFileSync('rm', ['-rf', `${container}/`], { stdio: 'ignore' })
    } catch {}
  },
} as Options.Testrunner
