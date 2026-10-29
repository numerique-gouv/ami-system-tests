import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {iosSystemNotificationsLocators} from '../../pages/locators/system-notifications.locators'

// Notifications système iOS : réglages lus sur le simulateur (xcrun simctl, base BulletinBoard) et bannières de SpringBoard.

export type IosNotificationAuthorization = 'absente' | 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'inconnue'

const STATUS_NAMES: IosNotificationAuthorization[] = ['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral']

function capability(name: string): string {
  const caps = driver.capabilities as Record<string, unknown>
  return (caps[`appium:${name}`] ?? caps[name]) as string
}

function simulatorUdid(): string {
  return capability('udid') || 'booted'
}

export function appBundleId(): string {
  return capability('bundleId')
}

/** Lit `authorizationStatus` de l'app dans la base BulletinBoard du simulateur. */
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

/** La base est écrite après la réponse à l'alerte : attend que l'autorisation atteigne `expected`. */
export async function waitForNotificationAuthorization(expected: IosNotificationAuthorization, timeout = 10000): Promise<IosNotificationAuthorization> {
  let last = 'inconnue'
  const reached = await browser.waitUntil(async () => {
    try { last = readNotificationAuthorization() } catch { last = 'illisible' }
    return last === expected
  }, {timeout, interval: 500}).catch(() => false)
  if (!reached) throw new Error(`Autorisation des notifications iOS : « ${expected} » attendue, « ${last} » constatée`)
  return expected
}

/** Simulateur (présent dans `simctl list`) ou appareil physique ; sans UDID, un simulateur. */
function isSimulator(): boolean {
  const udid = simulatorUdid()
  if (udid === 'booted') return true
  return execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], {encoding: 'utf8'}).includes(`"${udid}"`)
}

/** SpringBoard affiche les bannières : l'app passe en arrière-plan. */
export async function showSpringBoard(): Promise<void> {
  await driver.execute('mobile: activateApp', {bundleId: 'com.apple.springboard'})
}

/** Attend la bannière `title` (SpringBoard au premier plan) ; retourne le délai d'attente en ms. */
export async function waitForBanner(title: string, timeout = 15000): Promise<number> {
  const start = Date.now()
  await $(iosSystemNotificationsLocators.banner(title)).waitForExist({timeout})
  return Date.now() - start
}

/** La bannière `title` apparaît-elle pendant `durationMs` (SpringBoard au premier plan) ? */
export async function bannerAppearsWithin(title: string, durationMs: number): Promise<boolean> {
  return await $(iosSystemNotificationsLocators.banner(title)).waitForExist({timeout: durationMs}).then(() => true, () => false)
}

/** Clique la bannière `title` et attend que l'app repasse au premier plan. */
export async function tapBanner(title: string): Promise<void> {
  const bannerSelector = iosSystemNotificationsLocators.banner(title)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await $(bannerSelector).click()
      break
    } catch (err) {
      if (await driver.execute('mobile: queryAppState', {bundleId: appBundleId()}) === 4) break
      if (attempt === 3) throw err
    }
  }
  await driver.waitUntil(async () => (await driver.execute('mobile: queryAppState', {bundleId: appBundleId()})) === 4, {
    timeout: 15000, timeoutMsg: 'App pas repassée au premier plan après le tap sur la bannière',
  })
}

const SETTINGS_APP = 'com.apple.Preferences'

/** Tape le bord droit de la ligne libellée : le centre tombe sur le texte, sans effet. */
async function tapSwitchRow(selector: string): Promise<void> {
  const {x, y} = await $(selector).getLocation()
  const {width, height} = await $(selector).getSize()
  await driver.execute('mobile: tap', {x: Math.round(x + width - 30), y: Math.round(y + height / 2)})
}

/** Atteint Apps > AMI staging > Notifications dans Réglages, qui garde sa dernière position. */
async function navigateToAppNotificationsSettings(): Promise<void> {
  try {
    await navigateToAppNotificationsSettingsOnce()
  } catch {
    // Réglages parfois coincé sur un écran inattendu : relancé à neuf, une seule nouvelle tentative.
    await driver.execute('mobile: terminateApp', {bundleId: SETTINGS_APP})
    await driver.execute('mobile: activateApp', {bundleId: SETTINGS_APP})
    await navigateToAppNotificationsSettingsOnce()
  }
}

async function navigateToAppNotificationsSettingsOnce(): Promise<void> {
  const loc = iosSystemNotificationsLocators
  const done = async (): Promise<boolean> => (await $$(loc.osAllowNotificationsRow)).length > 0
  for (let hop = 0; hop < 10 && !await done(); hop++) {
    const next = [loc.osNotificationsRow, loc.osAppRow, loc.osAppsRow]
    let clicked = false
    for (const selector of next) {
      const found = await $$(selector)
      if (found.length > 0) { await found[0].click(); clicked = true; break }
    }
    if (!clicked) await driver.execute('mobile: scroll', {predicateString: loc.osAppsRowQuery, direction: 'down'}).catch(() => undefined)
    // eslint-disable-next-line wdio/no-pause -- animation de navigation de Réglages
    await browser.pause(1000)
  }
  if (!await done()) throw new Error('Réglages iOS : page Notifications de l\'app introuvable (Apps > AMI staging > Notifications)')
}

async function setOsAllowNotifications(on: boolean): Promise<void> {
  await navigateToAppNotificationsSettings()
  // Élément relu à chaque fois : la page Réglages se redessine après le tap.
  const value = async (): Promise<string> => String(await $(iosSystemNotificationsLocators.osSettingsSwitch).getAttribute('value'))
  await $(iosSystemNotificationsLocators.osSettingsSwitch).waitForExist({timeout: 10000, timeoutMsg: 'Interrupteur « Autoriser les notifications » absent de Réglages'})
  if (await value() === (on ? '1' : '0')) return
  // Le premier tap peut viser un élément disparu pendant le redessin : on retente jusqu'à ce que la valeur change.
  await browser.waitUntil(async () => {
    if (await value().catch(() => '') === (on ? '1' : '0')) return true
    await tapSwitchRow(iosSystemNotificationsLocators.osSettingsSwitch).catch(() => undefined)
    // eslint-disable-next-line wdio/no-pause -- temps de bascule de l'interrupteur
    await browser.pause(800)
    return await value().catch(() => '') === (on ? '1' : '0')
  }, {timeout: 15000, interval: 300, timeoutMsg: `Interrupteur « Autoriser les notifications » de Réglages pas à ${on ? '1' : '0'}`})
}

/**
 * Accepte (`on`) ou refuse les notifications depuis l'écran natif « Paramètres » d'AMI (déjà ouvert), puis constate la prise en compte
 * (sur simulateur, l'autorisation lue dans BulletinBoard). Accepter une autorisation non décidée ouvre l'alerte système, refusée ouvre Réglages ;
 * refuser ouvre Réglages (l'app ne peut pas révoquer elle-même). Appareil physique : non exercé.
 */
export async function setNotificationsFromAppSettings(on: boolean): Promise<'inchangé' | 'modifié'> {
  const loc = iosSystemNotificationsLocators
  const switchOn = async (): Promise<boolean> => (await $(loc.amiSettingsSwitch).getAttribute('value').catch(() => '')) === '1'
  // L'interrupteur n'est relu qu'au passage en premier plan.
  await showSpringBoard()
  await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
  await browser.waitUntil(async () => (await $$(loc.amiSettingsTitle)).length > 0, {timeout: 10000, timeoutMsg: 'Écran « Paramètres » d\'AMI absent'})
  const simulator = isSimulator()
  if (simulator) {
    const state = readNotificationAuthorization()
    await browser.waitUntil(async () => await switchOn() === (state === 'authorized'), {timeout: 8000, interval: 500,
      timeoutMsg: `Interrupteur d'AMI incohérent avec l'autorisation système « ${state} »`})
  }
  if (await switchOn() === on) return 'inchangé'
  await $(loc.amiSettingsSwitch).waitForExist({timeout: 10000})
  await tapSwitchRow(loc.amiSettingsSwitch)
  if (simulator && readNotificationAuthorization() === 'notDetermined') {
    await browser.waitUntil(async () => { try { await driver.getAlertText(); return true } catch { return false } }, {timeout: 10000, interval: 300, timeoutMsg: 'Alerte système de notifications absente'})
    if (on) await driver.acceptAlert(); else await driver.dismissAlert()
  } else if (!(on && simulator && readNotificationAuthorization() === 'authorized')) {
    await browser.waitUntil(async () => (await driver.execute('mobile: queryAppState', {bundleId: SETTINGS_APP})) === 4, {timeout: 10000, interval: 500, timeoutMsg: 'Réglages pas ouvert après le tap sur l\'interrupteur'})
    await setOsAllowNotifications(on)
    if (simulator) await waitForNotificationAuthorization(on ? 'authorized' : 'denied')
    await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
  }
  await browser.waitUntil(async () => await switchOn() === on, {timeout: 10000, interval: 500, timeoutMsg: `Interrupteur d'AMI pas à « ${on ? 'actif' : 'éteint'} »`})
  return 'modifié'
}
