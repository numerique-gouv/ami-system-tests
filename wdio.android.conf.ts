import { execFileSync } from 'child_process'
import path from 'path'
import type { Options } from '@wdio/types'
import { baseConfig } from './wdio.base.conf'
import { androidCapabilities } from './src/driver/capabilities'
import { resolveSpecs } from './test-suites'

export const config: Options.Testrunner = {
  ...baseConfig,

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
          // Appium 3 : format "<driver>:<feature>" requis pour les features insecure
          allowInsecure: 'uiautomator2:chromedriver_autodownload',
          log: '.wdio-logs/appium-android.log',
        },
      },
    ],
  ],

  port: 4723,

  // Sur Android 16 (API 36), un IAccessibilityServiceClient résiduel (run précédent interrompu,
  // Maestro désinstallé) bloque UiAutomation avec "already registered" / "id=-1".
  // Force-stop les packages susceptibles d'avoir laissé un client enregistré dans system_server.
  onPrepare(): void {
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}/platform-tools/adb`
      : process.env.ANDROID_SDK_ROOT
        ? `${process.env.ANDROID_SDK_ROOT}/platform-tools/adb`
        : `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
    for (const pkg of [
      'io.appium.uiautomator2.server.test',
      'io.appium.uiautomator2.server',
      'fr.gouv.ami.staging',
    ]) {
      try {
        execFileSync(adb, ['shell', 'am', 'force-stop', pkg], { stdio: 'ignore' })
      } catch {
        // Pas de device connecté ou package absent — ignoré
      }
    }
  },
} as Options.Testrunner
