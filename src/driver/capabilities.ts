import fs from 'fs'
import os from 'os'
import path from 'path'
import {isPreprod} from '../helpers/common/environment'

// AMI_ENV=preprod → builds préprod (flavor Android `preprod`, cible iOS `AMI-Preproduction`) ; sinon staging
// (y compris les review apps PR, qui passent par le sélecteur d'environnement du build staging).
const preprod = isPreprod()

// Chemins vers les apps buildées par les projets mobiles frères
//   Android : ./gradlew assemble<Flavor>Debug  (assembleStagingDebug / assemblePreprodDebug)
//   iOS     : xcodebuild -scheme AMI-Staging|AMI-Preproduction … -derivedDataPath ../build
const ANDROID_FLAVOR = preprod ? 'preprod' : 'staging'
const ANDROID_APP_PATH = path.resolve(
  __dirname,
  `../../../ami-app-android/app/build/outputs/apk/${ANDROID_FLAVOR}/debug/app-${ANDROID_FLAVOR}-debug.apk`
)

// Build iOS de référence : celui produit par Xcode (DerivedData), `AMI-xcodegen-*/Build/Products/Debug-iphonesimulator/
// AMI-Staging.app` (préprod : AMI-Preproduction.app). S'il y en a plusieurs, le plus récent. Repli : le build fait en ligne de
// commande avec `-derivedDataPath ../build` depuis ami-app-ios/ (donc à côté de ami-app-ios/, sous ami/), dont le produit staging
// s'appelle encore AMI-Production.app (nom historique, bundle fr.gouv.ami.staging). `IOS_APP_PATH` (variable d'environnement)
// surcharge tout.
function resolveIosAppPath(): string {
  if (process.env.IOS_APP_PATH) return process.env.IOS_APP_PATH
  const derivedData = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData')
  const xcodeApp = `${preprod ? 'AMI-Preproduction' : 'AMI-Staging'}.app`
  let candidates: Array<{path: string, mtimeMs: number}> = []
  try {
    candidates = fs.readdirSync(derivedData)
      .filter(dir => dir.startsWith('AMI-xcodegen-'))
      .map(dir => path.join(derivedData, dir, 'Build/Products/Debug-iphonesimulator', xcodeApp))
      .filter(appPath => fs.existsSync(appPath))
      .map(appPath => ({path: appPath, mtimeMs: fs.statSync(appPath).mtimeMs}))
  } catch {
    // DerivedData absent (machine sans Xcode, CI) : repli ci-dessous
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.path ?? path.resolve(
    __dirname,
    `../../../build/Build/Products/Debug-iphonesimulator/${preprod ? 'AMI-Preproduction' : 'AMI-Production'}.app`
  )
}
const IOS_APP_PATH = resolveIosAppPath()

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
  'appium:appPackage': preprod ? 'fr.gouv.ami.preprod' : 'fr.gouv.ami.staging',
  'appium:appActivity': 'fr.gouv.ami.MainActivity',
  // L'app reste installée, ouverte et connectée entre deux specs (une session Appium par spec). Avec `noReset: false`, le driver
  // désinstalle puis réinstalle l'app à chaque session (données et choix de l'environnement perdus). Avec `noReset: true`, il ne
  // l'arrête pas en fin de session et ne la relance pas si elle tourne. État propre en début de série et fermeture en fin de
  // série : onPrepare / onComplete de wdio.android.conf.ts.
  'appium:noReset': true,
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
  // Port local de WebDriverAgent surchargeable (IOS_WDA_PORT) pour un second simulateur en parallèle ; défaut du driver : 8100.
  ...(process.env.IOS_WDA_PORT ? {'appium:wdaLocalPort': Number(process.env.IOS_WDA_PORT)} : {}),
  'appium:app': IOS_APP_PATH,
  'appium:bundleId': preprod ? 'fr.gouv.ami.preproduction' : 'fr.gouv.ami.staging',
  // `noReset: true` laisse le simulateur tel quel (pas de réinstallation à chaque session) et WDA ne termine ni ne relance l'app.
  // LIMITE (vérifiée le 2026-10-12) : l'app lancée par WDA appartient au processus XCTRunner, que le driver tue à chaque nouvelle
  // session : elle ne reste PAS ouverte d'une spec à l'autre (le sélecteur d'environnement revient). Lancer l'app par `simctl` avec
  // `autoLaunch: false` a été essayé : WDA ne reçoit plus le bundleId et la WebView n'est plus trouvée. Piste non essayée : un WDA
  // persistant (`webDriverAgentUrl`). État propre en début de série et fermeture en fin : onPrepare / onComplete de wdio.ios.conf.ts.
  'appium:noReset': true,
  'appium:fullReset': false,
  // Sans ça, chaque session lance `open -Fn DeviceHub.app` (constaté le 2026-10-15 : 30 instances ouvertes après une campagne). Le
  // driver cherche l'app graphique par l'identifiant de Simulator.app, ne reconnaît pas DeviceHub (Xcode 26+, com.apple.dt.Devices),
  // croit le simulateur « sans fenêtre » et ouvre une nouvelle instance (`-n`) à chaque fois. En mode headless il n'ouvre rien.
  // La fenêtre pour un humain reste ouverte une fois par `just start-ios`.
  'appium:isHeadless': true,
  'appium:newCommandTimeout': 240,
  'appium:wdaLaunchTimeout': 120000,
  'appium:wdaConnectionTimeout': 120000,
  'appium:shouldTerminateApp': false,
  'appium:forceAppLaunch': false,
  'appium:autoAcceptAlerts': false,  // géré manuellement dans les tests
  // Sans WebView (sélecteur d'environnement, feuille native, app en relancement), `getContexts()` rejoue la recherche des pages web
  // 20 fois à 500 ms d'intervalle (défaut du driver) : ~10 s MESURÉS (2026-10-27) à chaque sonde `isWebContextAvailable()`, soit 30 s
  // perdues par connexion. Nos appelants sondent eux-mêmes en boucle (pickWebView, waitForWebViews) : 3 essais suffisent (~1,5 s).
  'appium:webviewConnectRetries': Number(process.env.IOS_WEBVIEW_RETRIES ?? 3),
}
