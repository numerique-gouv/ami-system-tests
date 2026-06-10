import path from 'path'

// Chemins vers les apps buildées (générées via `just build-android` / `just build-ios`)
const ANDROID_APP_PATH = path.resolve(
  __dirname,
  '../../../ami-app-android/app/build/outputs/apk/staging/debug/app-staging-debug.apk'
)

const IOS_APP_PATH = path.resolve(
  __dirname,
  '../../build/ios/Build/Products/Debug-iphonesimulator/AMI-Staging.app'
)

// ─── Android ────────────────────────────────────────────────────────────────

// `as WebdriverIO.Capabilities` plutôt qu'annotation `: WebdriverIO.Capabilities` —
// les capabilities Appium non standard (ex. chromedriverAutodownload) ne sont pas dans
// les types @wdio/types mais sont valides à l'exécution.
export const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  // Nom de l'AVD défini dans le justfile racine (android_avd := "Pixel_modern").
  // platformVersion volontairement absent : Appium détecte la version depuis l'appareil connecté.
  'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'Pixel_modern',
  'appium:app': ANDROID_APP_PATH,
  'appium:appPackage': 'fr.gouv.ami.staging',
  'appium:appActivity': 'fr.gouv.ami.MainActivity',
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,
  'appium:androidInstallTimeout': 90000,
  'appium:autoGrantPermissions': true,
  'appium:disableWindowAnimation': true,
  // Requis pour switchContext('WEBVIEW_*') — télécharge automatiquement le Chromedriver
  // correspondant à la version du WebView Android embarqué dans l'app.
  'appium:chromedriverAutodownload': true,
  // Délais étendus pour les émulateurs qui chargent depuis un snapshot —
  // UiAutomation peut mettre plus de 5 s à se connecter après le boot.
  'appium:uiautomator2ServerLaunchTimeout': 60000,
  'appium:uiautomator2ServerInstallTimeout': 60000,
} as WebdriverIO.Capabilities

// ─── iOS ────────────────────────────────────────────────────────────────────

export const iosCapabilities: WebdriverIO.Capabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  // Doit correspondre au simulateur booté par ios-start / ios_simulator dans le justfile racine.
  // platformVersion absent : Appium détecte la version depuis le simulateur connecté.
  'appium:deviceName': process.env.IOS_DEVICE_NAME ?? 'iPhone 17 Pro',
  'appium:app': IOS_APP_PATH,
  'appium:bundleId': 'fr.gouv.ami.staging',
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,
  'appium:wdaLaunchTimeout': 120000,
  'appium:wdaConnectionTimeout': 120000,
  'appium:shouldTerminateApp': true,
  'appium:autoAcceptAlerts': false,  // géré manuellement dans les tests
  // Réduit le délai par requête au débogueur WebKit (défaut ~10 s sur simulateur).
  // Sans cette valeur, chaque appel à getContexts() bloque ~10 s, ce qui rend
  // le polling de waitForWebViewContext() inefficace (une seule itération effective).
  'appium:webkitResponseTimeout': 3000,
}
