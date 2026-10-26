import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {homedir} from 'node:os'
import logger from '@wdio/logger'

/**
 * Notifications SYSTÈME iOS, côté SIMULATEUR : constat des réglages et simulation locale d'un push, via `xcrun simctl`.
 * iOS seulement : à n'appeler que si `driver.isIOS`.
 *
 * Périmètre : un push APNs RÉEL (jeton APNs, FCM → APNs) exige un appareil physique et reste hors périmètre ; `simctl push` injecte une
 * charge APNs fictive directement dans le simulateur (le jeton, le backend et Firebase ne sont pas exercés).
 *
 * Constaté le 2026-10-26 (iOS 26.5, Xcode 26) :
 *  - `simctl privacy` ne gère PAS les notifications (services : all, calendar, contacts, location, photos, microphone, motion, reminders,
 *    siri…) : on ne peut ni lire ni forcer la permission de notifications avec lui ;
 *  - la décision de l'utilisateur est lue dans `<simulateur>/data/Library/BulletinBoard/VersionedSectionInfo.plist` (NSKeyedArchiver,
 *    section `<bundleId>`, clé `authorizationStatus` = UNAuthorizationStatus : 0 non décidée, 1 refusée, 2 autorisée, 3 provisoire) ;
 *    la section n'existe pas tant que l'app n'a rien demandé ;
 *  - le journal `log show` du simulateur donne aussi l'état vu par l'app (« Authorization status: 2 (authorized) »).
 */

const log = logger('helper')
const BANNER = '-ios predicate string:name == "NotificationShortLookView"'

export type IosNotificationAuthorization = 'absente' | 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'inconnue'

const STATUS_NAMES: IosNotificationAuthorization[] = ['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral']

function capability(name: string): string {
  return (driver.capabilities as Record<string, unknown>)[name] as string
}

/** UDID du simulateur de la session (capabilities Appium), ou `booted`. */
export function simulatorUdid(): string {
  return capability('appium:udid') || 'booted'
}

export function appBundleId(): string {
  return capability('appium:bundleId')
}

/** Lit `authorizationStatus` de l'app dans la base BulletinBoard du simulateur (voir l'en-tête du fichier). */
export function readNotificationAuthorization(bundleId = appBundleId(), udid = simulatorUdid()): IosNotificationAuthorization {
  const resolved = udid === 'booted'
    ? execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {encoding: 'utf8'}).match(/"udid"\s*:\s*"([0-9A-F-]+)"/)?.[1] ?? ''
    : udid
  const file = join(homedir(), 'Library/Developer/CoreSimulator/Devices', resolved, 'data/Library/BulletinBoard/VersionedSectionInfo.plist')
  const script = `
import plistlib, sys
d = plistlib.load(open(sys.argv[1], 'rb'))
b = d.get('sectionInfo', {}).get(sys.argv[2])
if b is None:
    print('absente')
else:
    for o in plistlib.loads(b)['$objects']:
        if isinstance(o, dict) and 'authorizationStatus' in o:
            print(o['authorizationStatus'])
            break
`
  const out = execFileSync('python3', ['-I', '-c', script, file, bundleId], {encoding: 'utf8'}).trim()
  if (out === 'absente') return 'absente'
  return STATUS_NAMES[Number(out)] ?? 'inconnue'
}

/** Attend (la base est écrite après la réponse à l'alerte) que l'autorisation atteigne `expected`. */
export async function waitForNotificationAuthorization(expected: IosNotificationAuthorization, timeout = 10000): Promise<IosNotificationAuthorization> {
  let last: IosNotificationAuthorization = 'inconnue'
  await browser.waitUntil(async () => (last = readNotificationAuthorization()) === expected, {
    timeout, interval: 500, timeoutMsg: `Autorisation des notifications iOS : « ${expected} » attendue, constatée dans le simulateur : « ${last} »`,
  })
  return last
}

export interface SimulatedPush {
  title: string
  body: string
  /**
   * Champ `app_url` lu par l'app (NotificationManager.swift, `didReceive`) au tap : elle ouvre `/#/notifications` relatif à cette URL.
   * Sans lui, le tap n'ouvre rien de particulier.
   */
  appUrl?: string
}

/** `xcrun simctl push <simulateur> <bundleId> <charge>` : charge APNs fictive (titre, corps, son, `app_url`). */
export function simctlPush(push: SimulatedPush): void {
  const dir = mkdtempSync(join(tmpdir(), 'ami-push-'))
  const file = join(dir, 'payload.json')
  try {
    writeFileSync(file, JSON.stringify({aps: {alert: {title: push.title, body: push.body}, sound: 'default'}, ...(push.appUrl ? {app_url: push.appUrl} : {})}))
    execFileSync('xcrun', ['simctl', 'push', simulatorUdid(), appBundleId(), file], {encoding: 'utf8'})
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
}

/**
 * Pousse la notification et CLIQUE sur sa bannière. La bannière appartient à SpringBoard : on y amène donc l'écran (l'app passe en arrière-plan),
 * puis on cherche `NotificationShortLookView` (libellé « <APP>, maintenant, <titre>, <corps> »). Le tap relance l'app et déclenche
 * `didReceive` (app_url). Retourne quand l'app est au premier plan.
 */
export async function pushAndTapBanner(push: SimulatedPush): Promise<void> {
  await driver.execute('mobile: activateApp', {bundleId: 'com.apple.springboard'})
  simctlPush(push)
  const banner = $(`${BANNER} AND label CONTAINS ${JSON.stringify(push.title)}`)
  await banner.waitForExist({timeout: 15000, timeoutMsg: `Bannière de la notification « ${push.title} » absente de SpringBoard après 15000ms`})
  log.info(`Bannière affichée : « ${await banner.getAttribute('label')} », tap`)
  await banner.click()
  await driver.waitUntil(async () => (await driver.execute('mobile: queryAppState', {bundleId: appBundleId()})) === 4, {
    timeout: 15000, timeoutMsg: 'L\'app n\'est pas repassée au premier plan après le tap sur la bannière',
  })
}

/** Attend qu'une WebView de l'app affiche la route `/#/notifications` (le tap la charge dans une WebView supplémentaire) ; retourne son contexte. */
export async function waitForNotificationsRoute(timeout = 20000): Promise<string> {
  let found = ''
  await browser.waitUntil(async () => {
    for (const context of (await driver.getContexts()).map(String).filter(c => c.startsWith('WEBVIEW'))) {
      await driver.switchContext(context)
      if ((await browser.getUrl()).endsWith('/#/notifications')) { found = context; return true }
    }
    return false
  }, {timeout, interval: 1000, timeoutMsg: 'Aucune WebView n\'affiche /#/notifications après le tap sur la bannière'})
  return found
}
