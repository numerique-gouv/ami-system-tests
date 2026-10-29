import fs from 'fs'
import os from 'os'
import path from 'path'
import {isPreprod} from '../helpers/common/environment'

// AMI_ENV=preprod → identifiants d'app préprod (package Android `fr.gouv.ami.preprod`, bundle iOS `fr.gouv.ami.preproduction`) ;
// sinon staging (y compris les review apps PR, qui passent par le sélecteur d'environnement du build staging).
// AMI_ENV doit donc correspondre à l'app visée par ANDROID_APP_PATH / IOS_APP_PATH.
const preprod = isPreprod()

/**
 * Chemin d'une app mobile buildée, lu dans la variable d'environnement `name` (source unique : aucun chemin par défaut calculé).
 * Un chemin relatif se lit depuis la racine du projet (`../ami-app-android/…`), `~/` désigne le dossier personnel ; aucun motif (glob).
 * Absente, ou ne désignant aucun fichier : erreur qui nomme la variable. Valeurs d'exemple dans le gabarit `.env.example`, construction des
 * apps dans le README (Prérequis).
 */
function appPathFromEnv(name: 'ANDROID_APP_PATH' | 'IOS_APP_PATH'): string {
  const raw = process.env[name]?.trim()
  if (!raw) {
    throw new Error(`${name} est absente : renseigner le chemin de l'app buildée (gabarit .env.example, README « Prérequis »).`)
  }
  const value = path.resolve(path.resolve(__dirname, '../..'), raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw)
  if (!fs.existsSync(value)) {
    throw new Error(`${name} désigne un chemin inexistant : ${value} (app non buildée ? voir README « Prérequis »).`)
  }
  return value
}

/**
 * Ajoute `appium:app` à `caps` comme propriété paresseuse : la variable n'est exigée (et le fichier cherché) qu'à la première lecture, donc
 * seulement pour un run de cette plateforme (ce module est chargé par les configs Android et iOS). Une écriture ultérieure
 * (wdio complète les capabilities) la remplace par une propriété ordinaire.
 */
function withLazyAppPath(caps: WebdriverIO.Capabilities, name: 'ANDROID_APP_PATH' | 'IOS_APP_PATH'): void {
  const plain = (value: string): PropertyDescriptor => ({value, enumerable: true, writable: true, configurable: true})
  Object.defineProperty(caps, 'appium:app', {
    enumerable: true,
    configurable: true,
    get(): string {
      const value = appPathFromEnv(name)
      Object.defineProperty(caps, 'appium:app', plain(value))
      return value
    },
    set(value: string) {
      Object.defineProperty(caps, 'appium:app', plain(value))
    },
  })
}

// ─── Android ────────────────────────────────────────────────────────────────

// `as WebdriverIO.Capabilities` plutôt qu'annotation `: WebdriverIO.Capabilities` —
// les capabilities Appium non standard (ex. chromedriverAutodownload) ne sont pas dans
// les types @wdio/types mais sont valides à l'exécution.
export const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  // platformVersion volontairement absent : Appium détecte la version depuis l'appareil connecté.
  // Appareil visé : `appium:udid` seul (ANDROID_UDID = numéro de série adb, `adb devices`). Doc du driver UiAutomator2 : `deviceName` ne sert
  // pas à choisir l'appareil, et `udid` est à toujours renseigner pour des tests en parallèle. Sans ANDROID_UDID : le premier appareil connecté.
  // L'émulateur est démarré avant le run (Android Studio, ou `emulator -avd <nom> -port <port>` : son numéro de série est `emulator-<port>`) ;
  // la capability native `appium:avd` (démarrage par Appium) n'est pas utilisée : démarrage à froid à chaque run, peu fiable (README).
  ...(process.env.ANDROID_UDID ? {'appium:udid': process.env.ANDROID_UDID} : {}),
  // Ports locaux surchargeables (ANDROID_SYSTEM_PORT : serveur UiAutomator2, défaut 8200 ; ANDROID_CHROMEDRIVER_PORT : défaut 9515)
  // pour un second émulateur en parallèle sans conflit avec celui par défaut.
  ...(process.env.ANDROID_SYSTEM_PORT ? {'appium:systemPort': Number(process.env.ANDROID_SYSTEM_PORT)} : {}),
  ...(process.env.ANDROID_CHROMEDRIVER_PORT ? {'appium:chromedriverPort': Number(process.env.ANDROID_CHROMEDRIVER_PORT)} : {}),
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
withLazyAppPath(androidCapabilities, 'ANDROID_APP_PATH')

// ─── iOS ────────────────────────────────────────────────────────────────────

export const iosCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  // Simulateur visé : `appium:udid` seul (IOS_UDID). Doc du driver XCUITest : « soit `udid`, soit `deviceName` + `platformVersion` », et `udid` est à
  // toujours renseigner pour des tests en parallèle ; `deviceName` et `platformVersion` sont donc absents.
  // UDID du simulateur visé (IOS_UDID ; XCUITest le démarre s'il est arrêté) : sans lui ni platformVersion, XCUITest prend le runtime iOS le plus récent
  // et, s'il ne correspond pas à celui du simulateur nommé, crée un simulateur temporaire jetable (appiumTest-…) très lent à démarrer.
  ...(process.env.IOS_UDID ? {'appium:udid': process.env.IOS_UDID} : {}),
  // Port local de WebDriverAgent surchargeable (IOS_WDA_PORT) pour un second simulateur en parallèle ; défaut du driver : 8100.
  ...(process.env.IOS_WDA_PORT ? {'appium:wdaLocalPort': Number(process.env.IOS_WDA_PORT)} : {}),
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
  // La fenêtre pour un humain reste à ouvrir par Xcode (ou Simulator) pour un humain.
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
} as WebdriverIO.Capabilities
withLazyAppPath(iosCapabilities, 'IOS_APP_PATH')
