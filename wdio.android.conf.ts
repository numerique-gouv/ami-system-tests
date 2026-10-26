import path from 'path'
import type { Options } from '@wdio/types'
import logger from '@wdio/logger'
import { baseConfig, traceRootDir, traceServices } from './wdio.base.conf'
import { androidCapabilities } from './src/driver/capabilities'
import { androidForceStop, androidUninstallApp } from './src/helpers/device-app'
import { resolveSpecs } from './test-suites'

const ANDROID_APP_PACKAGE = androidCapabilities['appium:appPackage'] as string

const log = logger('config')

export const config: Options.Testrunner = {
  ...baseConfig,

  rootDir: traceRootDir('android'),

  specs: resolveSpecs(path.resolve(__dirname, 'src/tests/mobile/**/*.test.ts')),

  capabilities: [androidCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: 4723,
          relaxedSecurity: false,
          // Appium 3 : format "<driver>:<feature>" requis pour les features insecure, séparées par des virgules.
          // adb_shell : `mobile: shell` (README appium-uiautomator2-driver) — constater côté système les notifications
          // (dumpsys notification, appops/permission POST_NOTIFICATIONS) ; cf. src/helpers/android-notifications.ts.
          allowInsecure: 'uiautomator2:chromedriver_autodownload,uiautomator2:adb_shell',
          log: '.wdio-logs/appium-android.log',
          // debug (et non le défaut info) : nécessaire pour que
          // appium:showChromedriverLog (cf. capabilities.ts) fasse remonter la sortie du
          // process chromedriver dans ce fichier — diagnostic de la boucle SIGTERM en CI.
          logLevel: 'debug',
        },
      },
    ],
    ...traceServices,
  ],

  port: 4723,

  // Début de série : sur Android 16 (API 36), un IAccessibilityServiceClient résiduel (run précédent interrompu, Maestro
  // désinstallé) bloque UiAutomation avec "already registered" / "id=-1" : on arrête les packages susceptibles d'en avoir laissé un
  // dans system_server. L'app est aussi désinstallée : avec `noReset: true`, le driver la réinstalle à la première session, puis
  // la réutilise d'une spec à l'autre (état propre à chaque série, pas de réinstallation entre deux specs).
  onPrepare(): void {
    androidForceStop(['io.appium.uiautomator2.server.test', 'io.appium.uiautomator2.server', ANDROID_APP_PACKAGE])
    androidUninstallApp(ANDROID_APP_PACKAGE)
  },

  // Fin de série : l'app, restée ouverte entre les specs, est fermée (l'appareil reste allumé).
  onComplete: [baseConfig.onComplete as () => void, (): void => androidForceStop([ANDROID_APP_PACKAGE])],
} as Options.Testrunner
