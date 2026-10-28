import path from 'path'
import type { Options } from '@wdio/types'
import logger from '@wdio/logger'
import { baseConfig, traceRootDir, traceServices } from './wdio.base.conf'
import { androidCapabilities } from './src/driver/capabilities'
import { androidForceStop, androidUninstallApp } from './src/helpers/mobile/device-app'

const ANDROID_APP_PACKAGE = androidCapabilities['appium:appPackage'] as string

const log = logger('config')
// Port Appium surchargeable (ANDROID_APPIUM_PORT) pour un second émulateur en parallèle ; défaut 4723.
const APPIUM_PORT = Number(process.env.ANDROID_APPIUM_PORT ?? 4723)

export const config: Options.Testrunner = {
  ...baseConfig,

  rootDir: traceRootDir('android'),

  specs: [path.resolve(__dirname, 'src/tests/mobile/**/*.test.ts')],

  capabilities: [androidCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: APPIUM_PORT,
          relaxedSecurity: false,
          // Appium 3 : format "<driver>:<feature>" requis pour les features insecure, séparées par des virgules.
          // adb_shell : `mobile: shell` (README appium-uiautomator2-driver) — constater côté système les notifications
          // (dumpsys notification, appops/permission POST_NOTIFICATIONS) ; cf. src/helpers/mobile/android-notifications.ts.
          allowInsecure: 'uiautomator2:chromedriver_autodownload,uiautomator2:adb_shell',
          log: `.wdio-logs/appium-android${APPIUM_PORT === 4723 ? '' : `-${APPIUM_PORT}`}.log`,
          // debug (et non le défaut info) : nécessaire pour que
          // appium:showChromedriverLog (cf. capabilities.ts) fasse remonter la sortie du
          // process chromedriver dans ce fichier — diagnostic de la boucle SIGTERM en CI.
          logLevel: 'debug',
        },
      },
    ],
    ...traceServices,
  ],

  port: APPIUM_PORT,

  // Début de série : sur Android 16 (API 36), un IAccessibilityServiceClient résiduel (run précédent interrompu, Maestro
  // désinstallé) bloque UiAutomation avec "already registered" / "id=-1" : on arrête les packages susceptibles d'en avoir laissé un
  // dans system_server. L'app est aussi désinstallée : avec `noReset: true`, le driver la réinstalle à la première session, puis
  // la réutilise d'une spec à l'autre (état propre à chaque série, pas de réinstallation entre deux specs).
  onPrepare(): void {
    androidForceStop(['io.appium.uiautomator2.server.test', 'io.appium.uiautomator2.server', ANDROID_APP_PACKAGE])
    androidUninstallApp(ANDROID_APP_PACKAGE)
  },

  // Un test échoué (renderer de la WebView perdu, app bloquée) ne doit pas contaminer la spec suivante, qui ouvre une session sur
  // l'app restée en l'état (`noReset: true`) : mesuré le 2026-10-28, `notifications` et `profil` échouaient en `before all` (aucune
  // WebView) après un `demarches` en échec. L'app est donc arrêtée après CHAQUE spec (données et session conservées) : la session
  // suivante la relance (autoLaunch du driver), toujours connectée.
  afterSession: (): void => androidForceStop([ANDROID_APP_PACKAGE]),

  // Scénarios séquentiels (chaque `it` part de l'état laissé par le précédent) : au premier échec, Mocha ne lance plus les `it` suivants
  // (qui échoueraient en cascade, 180 s chacun mesurés sur iOS) mais exécute quand même les hooks `after`/`afterEach` de nettoyage.
  mochaOpts: {...baseConfig.mochaOpts, bail: true},

  // Fin de série : l'app, restée ouverte entre les specs, est fermée (l'appareil reste allumé). Quand Appium a lui-même démarré l'AVD
  // (ANDROID_AVD, absent d'adb lors d'onPrepare : la désinstallation ci-dessus n'a alors pas pu se faire), l'app est aussi désinstallée
  // ici : l'AVD survit au run (ses données restent) et sans cela le run suivant partirait d'une app encore connectée (constaté le 2026-10-27).
  onComplete: [baseConfig.onComplete as () => void, (): void => {
    androidForceStop([ANDROID_APP_PACKAGE])
    if (process.env.ANDROID_AVD) androidUninstallApp(ANDROID_APP_PACKAGE)
  }],
} as Options.Testrunner
