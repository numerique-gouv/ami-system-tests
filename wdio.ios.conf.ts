import { execFileSync } from 'child_process'
import path from 'path'
import type { Options } from '@wdio/types'
import logger from '@wdio/logger'
import { baseConfig, traceRootDir, traceServices } from './wdio.base.conf'
import { iosCapabilities } from './src/driver/capabilities'
import { iosBootedUdid, iosTerminateApp, iosUninstallApp } from './src/helpers/mobile/device-app'

const APP_ID = iosCapabilities['appium:bundleId'] as string
const log = logger('config')
// Port Appium surchargeable (IOS_APPIUM_PORT) pour faire tourner un second simulateur en parallèle ; défaut 4724.
const APPIUM_PORT = Number(process.env.IOS_APPIUM_PORT ?? 4724)

export const config: Options.Testrunner = {
  ...baseConfig,

  rootDir: traceRootDir('ios'),

  specs: [path.resolve(__dirname, 'src/tests/mobile/**/*.test.ts')],

  capabilities: [iosCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: APPIUM_PORT, // 4724 par défaut : différent d'Android pour éviter tout conflit
          relaxedSecurity: false,
          log: `.wdio-logs/appium-ios${APPIUM_PORT === 4724 ? '' : `-${APPIUM_PORT}`}.log`,
        },
      },
    ],
    ...traceServices,
  ],

  port: APPIUM_PORT,

  // Réinitialise la session FranceConnect et désinstalle l'app (donc son conteneur de données) avant chaque run.
  // Logique portée uniquement ici, exécutée une seule fois avant tout worker.
  // Un effacement partiel (WebKit/cookies seuls) laisse l'app dans un état incohérent
  // où la WKWebView se reconnecte sans afficher la mire FC.
  onPrepare(): void {
    const udid = iosBootedUdid()
    if (!udid) {
      log.warn('onPrepare : aucun simulateur iOS démarré — reset FC ignoré.')
      return
    }
    // L'app est arrêtée avant d'effacer ses données : une app encore ouverte garderait son état en mémoire.
    iosTerminateApp(APP_ID)
    const sim = (args: string[]): void => {
      try {
        execFileSync('xcrun', ['simctl', ...args], { stdio: 'ignore' })
      } catch (err) {
        log.warn(`simctl ${args.join(' ')} a échoué (ignoré)`, err)
      }
    }
    sim(['privacy', udid, 'reset', 'notifications', APP_ID])
    sim(['spawn', udid, 'defaults', 'delete', 'com.apple.SafariViewService'])
    sim(['spawn', udid, 'rm', '-rf', '/Library/Caches/com.apple.SafariViewService'])
    sim(['spawn', udid, 'rm', '-f', '/var/mobile/Library/Cookies/com.apple.SafariViewService.binarycookies'])
    // L'app est désinstallée (son conteneur de données avec elle) : la première session installe le build courant, que les specs
    // suivantes réutilisent (`noReset: true`).
    iosUninstallApp(APP_ID)
  },

  // L'app est terminée après CHAQUE spec : la spec suivante part d'un processus neuf, même si le test a laissé l'app bloquée.
  // Le conteneur de données (session, permissions) est conservé ; la session suivante relance l'app (autoLaunch).
  afterSession: (): void => iosTerminateApp(APP_ID),

  // Scénarios séquentiels : au premier échec, Mocha ne lance plus les `it` suivants (cascade de timeouts)
  // mais exécute quand même les hooks `after`/`afterEach` de nettoyage.
  mochaOpts: {...baseConfig.mochaOpts, bail: true},

  // Pas de fermeture en fin de série : afterSession a déjà terminé l'app après la dernière spec.
} as Options.Testrunner
