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

  // Sur Android 16 (API 36), un serveur UiAutomator2 stale (run précédent tué abruptement)
  // bloque la première session Appium avec "already registered". Nettoyé une seule fois
  // avant le run — Appium gère proprement ses APKs entre les spec files.
  onPrepare(): void {
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}/platform-tools/adb`
      : process.env.ANDROID_SDK_ROOT
        ? `${process.env.ANDROID_SDK_ROOT}/platform-tools/adb`
        : `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
    try {
      execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server.test'], { stdio: 'ignore' })
      execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server'], { stdio: 'ignore' })
    } catch {
      // Pas de device connecté ou APK absent — ignoré
    }
  },
} as Options.Testrunner
