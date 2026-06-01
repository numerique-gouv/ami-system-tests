import { execFileSync } from 'child_process'
import type { Options } from '@wdio/types'
import { baseConfig } from './wdio.base.conf'
import { androidCapabilities } from './src/driver/capabilities'

export const config: Options.Testrunner = {
  ...baseConfig,

  capabilities: [androidCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: 4723,
          relaxedSecurity: false,
          // Appium 3 : format "<driver>:<feature>" requis pour les features insecure
          allowInsecure: 'uiautomator2:chromedriver_autodownload',
          log: '.wdio-logs/appium-android.log',
        },
      },
    ],
  ],

  port: 4723,

  // Sur Android 16 (API 36), une session UiAutomation stale (laissée par Maestro ou un run
  // précédent) bloque la création d'une nouvelle session Appium avec "already registered".
  // Force-stop les APKs UiAutomator2 avant chaque session pour nettoyer l'état.
  beforeSession(): void {
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}/platform-tools/adb`
      : process.env.ANDROID_SDK_ROOT
        ? `${process.env.ANDROID_SDK_ROOT}/platform-tools/adb`
        : `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
    try {
      execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server.test'], { stdio: 'ignore' })
      execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server'], { stdio: 'ignore' })
      // Maestro laisse aussi un IAccessibilityServiceClient enregistré dans system_server
      execFileSync(adb, ['shell', 'am', 'force-stop', 'dev.mobile.maestro'], { stdio: 'ignore' })
      execFileSync(adb, ['shell', 'am', 'force-stop', 'dev.mobile.maestro.test'], { stdio: 'ignore' })
    } catch {
      // Pas de device connecté ou APK absent — ignoré
    }
  },
} as Options.Testrunner
