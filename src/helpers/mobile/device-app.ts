import {execFileSync} from 'child_process'
import logger from '@wdio/logger'

const log = logger('config')

// Appelées une fois par run (`onPrepare` / `onComplete` des configs), jamais fatales : un appareil absent est signalé.

function adb(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  return sdk ? `${sdk}/platform-tools/adb` : `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`
}

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

/** Début de série : avec `noReset: true`, le driver réinstalle l'app à la première session, ce qui repart d'un état propre. */
export function androidUninstallApp(pkg: string): void {
  try {
    runAdb(['uninstall', pkg])
  } catch (err) {
    warn(`adb uninstall ${pkg}`, err)
  }
}

/** UDID du simulateur iOS visé (`IOS_UDID`), sinon le premier simulateur démarré. */
export function iosBootedUdid(): string | undefined {
  if (process.env.IOS_UDID) return process.env.IOS_UDID
  return execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], {encoding: 'utf-8'})
    .match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i)?.[0]
}

/** Début de série : avec `noReset: true`, le driver n'installe l'app que si elle est absente, donc sans cela un ancien build serait réutilisé. */
export function iosUninstallApp(bundleId: string): void {
  try {
    const udid = iosBootedUdid()
    if (udid) execFileSync('xcrun', ['simctl', 'uninstall', udid, bundleId], {stdio: 'ignore'})
  } catch (err) {
    warn(`simctl uninstall ${bundleId}`, err)
  }
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
