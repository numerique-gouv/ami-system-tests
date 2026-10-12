import {execFileSync} from 'child_process'
import logger from '@wdio/logger'

const log = logger('config')

/**
 * Cycle de vie de l'app sur l'appareil, hors Appium : état propre au début d'une série de specs, fermeture à la fin.
 * Entre deux specs, l'app reste ouverte et connectée (`noReset: true`, cf. capabilities.ts) ; ces fonctions ne sont appelées
 * qu'une fois par run, depuis `onPrepare` / `onComplete` des configs. Elles ne touchent ni à l'émulateur ni au simulateur
 * (jamais éteints, jamais supprimés) et n'échouent jamais : un appareil absent est signalé, pas fatal.
 */

function adb(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  return sdk ? `${sdk}/platform-tools/adb` : `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
}

/** `adb [-s <série>] …` : l'appareil visé par les recettes just (`ANDROID_UDID`), sinon le seul appareil connecté. */
function runAdb(args: string[]): void {
  const serial = process.env.ANDROID_UDID
  execFileSync(adb(), [...(serial ? ['-s', serial] : []), ...args], {stdio: 'ignore'})
}

function warn(action: string, err: unknown): void {
  log.warn(`${action} impossible (appareil absent ou app non installée ?)`, err)
}

/** Arrête des processus Android (sans toucher à l'appareil). */
export function androidForceStop(packages: string[]): void {
  for (const pkg of packages) {
    try {
      runAdb(['shell', 'am', 'force-stop', pkg])
    } catch (err) {
      warn(`adb force-stop ${pkg}`, err)
    }
  }
}

/**
 * Début de série : désinstalle l'app. Avec `noReset: true`, le driver la réinstalle (permissions accordées) à la première session,
 * puis la réutilise : chaque série repart d'un état propre, sans réinstallation entre deux specs.
 */
export function androidUninstallApp(pkg: string): void {
  try {
    runAdb(['uninstall', pkg])
  } catch (err) {
    warn(`adb uninstall ${pkg}`, err)
  }
}

/** UDID du simulateur iOS visé (`IOS_UDID`, posé par les recettes just), sinon le premier simulateur démarré. */
export function iosBootedUdid(): string | undefined {
  if (process.env.IOS_UDID) return process.env.IOS_UDID
  return execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], {encoding: 'utf-8'})
    .match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i)?.[0]
}

/** Termine l'app iOS (le simulateur reste démarré). */
export function iosTerminateApp(bundleId: string): void {
  try {
    const udid = iosBootedUdid()
    if (udid) execFileSync('xcrun', ['simctl', 'terminate', udid, bundleId], {stdio: 'ignore'})
  } catch (err) {
    warn(`simctl terminate ${bundleId}`, err)
  }
}
