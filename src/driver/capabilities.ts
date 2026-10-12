import path from 'path'

// Chemins vers les apps buildées par les projets mobiles frères
const ANDROID_APP_PATH = path.resolve(
  __dirname,
  '../../../ami-app-android/app/build/outputs/apk/staging/debug/app-staging-debug.apk'
)

// Le projet iOS construit avec -derivedDataPath ../build depuis ami-app-ios/, donc à côté
// de ami-app-ios/ (sibling sous ami/), pas dans ami-app-ios/build/.
const IOS_APP_PATH = path.resolve(
  __dirname,
  '../../../build/Build/Products/Debug-iphonesimulator/AMI-Production.app'
)

// ─── Android ────────────────────────────────────────────────────────────────

// `as WebdriverIO.Capabilities` plutôt qu'annotation `: WebdriverIO.Capabilities` —
// les capabilities Appium non standard (ex. chromedriverAutodownload) ne sont pas dans
// les types @wdio/types mais sont valides à l'exécution.
export const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  // platformVersion volontairement absent : Appium détecte la version depuis l'appareil connecté.
  // Absent sans `--device` : Appium prend alors le premier appareil connecté (émulateur ou physique).
  ...(process.env.ANDROID_DEVICE_NAME ? {'appium:deviceName': process.env.ANDROID_DEVICE_NAME} : {}),
  // Numéro de série adb de l'appareil visé (posé par les recettes just) : sans lui, Appium prend le premier appareil
  // connecté, qui peut être un téléphone branché à côté de l'émulateur demandé.
  ...(process.env.ANDROID_UDID ? {'appium:udid': process.env.ANDROID_UDID} : {}),
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
  // Diagnostic de la boucle "Chromedriver exited unexpectedly ... signal SIGTERM" observée en
  // CI (cf. commentaires action.yml côté ami-system-tests) : fait remonter la sortie du process
  // chromedriver dans le log Appium (voir `logLevel: 'debug'` dans wdio.android.conf.ts) pour
  // voir la commande/version réellement lancée et la raison du crash.
  'appium:showChromedriverLog': true,
  // Délais étendus pour les émulateurs qui chargent depuis un snapshot —
  // UiAutomation peut mettre plus de 5 s à se connecter après le boot.
  'appium:uiautomator2ServerLaunchTimeout': 60000,
  'appium:uiautomator2ServerInstallTimeout': 60000,
} as WebdriverIO.Capabilities

// ─── iOS ────────────────────────────────────────────────────────────────────

export const iosCapabilities: WebdriverIO.Capabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  // Nom du simulateur, donné par `--device` (justfile). platformVersion absent : le simulateur est visé par son UDID (ci-dessous).
  'appium:deviceName': process.env.IOS_DEVICE_NAME,
  // UDID du simulateur visé (posé par les recettes just) : sans lui ni platformVersion, XCUITest prend le runtime iOS le plus récent
  // et, s'il ne correspond pas à celui du simulateur nommé, crée un simulateur temporaire jetable (appiumTest-…) très lent à démarrer.
  ...(process.env.IOS_UDID ? {'appium:udid': process.env.IOS_UDID} : {}),
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
