import {execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {homedir} from 'node:os'
import logger from '@wdio/logger'
import {iosSystemNotificationsLocators} from '../../pages/locators/system-notifications.locators'

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

export type IosNotificationAuthorization = 'absente' | 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'inconnue'

const STATUS_NAMES: IosNotificationAuthorization[] = ['notDetermined', 'denied', 'authorized', 'provisional', 'ephemeral']

/** Capacité de la session, avec ou sans le préfixe `appium:` (selon ce que le serveur renvoie). */
function capability(name: string): string {
  const caps = driver.capabilities as Record<string, unknown>
  return (caps[`appium:${name}`] ?? caps[name]) as string
}

/** UDID du simulateur de la session (capabilities Appium), ou `booted`. */
export function simulatorUdid(): string {
  return capability('udid') || 'booted'
}

export function appBundleId(): string {
  return capability('bundleId')
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
  let last = 'inconnue'
  const reached = await browser.waitUntil(async () => {
    try { last = readNotificationAuthorization() } catch (err) { last = `illisible (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` }
    return last === expected
  }, {timeout, interval: 500}).catch(() => false)
  if (!reached) throw new Error(`Autorisation des notifications iOS : « ${expected} » attendue, constatée dans le simulateur : « ${last} » (simulateur ${simulatorUdid()}, app ${appBundleId()})`)
  return expected
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

/** Appareil de la session : simulateur (présent dans `simctl list`) ou appareil physique ? Sans UDID de capacité, on suppose un simulateur (`booted`). */
export function isSimulator(): boolean {
  const udid = simulatorUdid()
  if (udid === 'booted') return true
  return execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], {encoding: 'utf8'}).includes(`"${udid}"`)
}

/** Amène SpringBoard au premier plan (l'app passe en arrière-plan) : c'est lui qui affiche les bannières. */
export async function showSpringBoard(): Promise<void> {
  await driver.execute('mobile: activateApp', {bundleId: 'com.apple.springboard'})
}

/** Attend la bannière de la notification `title` dans SpringBoard (SpringBoard déjà au premier plan) ; retourne le délai d'attente en ms. */
export async function waitForBanner(title: string, timeout = 15000): Promise<number> {
  const start = Date.now()
  await $(iosSystemNotificationsLocators.banner(title)).waitForExist({timeout, timeoutMsg: `Bannière de la notification « ${title} » absente de SpringBoard après ${timeout}ms`})
  return Date.now() - start
}

/** true si la bannière de `title` apparaît dans SpringBoard pendant `durationMs` (sondage ; SpringBoard déjà au premier plan). */
export async function bannerAppearsWithin(title: string, durationMs: number): Promise<boolean> {
  return await $(iosSystemNotificationsLocators.banner(title)).waitForExist({timeout: durationMs}).then(() => true, () => false)
}

/**
 * Clique la bannière `title` et attend que l'app repasse au premier plan (le tap relance l'app et déclenche `didReceive` : app_url).
 * La bannière s'anime puis disparaît : l'élément trouvé peut devenir périmé entre la recherche et le tap (constaté). On le
 * retrouve à chaque tentative ; si l'app est déjà revenue au premier plan, le tap a eu lieu.
 */
export async function tapBanner(title: string): Promise<void> {
  const bannerSelector = iosSystemNotificationsLocators.banner(title)
  log.info(`Bannière affichée pour « ${title} », tap`)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await $(bannerSelector).click()
      break
    } catch (err) {
      if (await driver.execute('mobile: queryAppState', {bundleId: appBundleId()}) === 4) break
      if (attempt === 3) throw err
      log.warn(`ANOMALIE : tap sur la bannière impossible (${attempt}/3) : ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
    }
  }
  await driver.waitUntil(async () => (await driver.execute('mobile: queryAppState', {bundleId: appBundleId()})) === 4, {
    timeout: 15000, timeoutMsg: 'L\'app n\'est pas repassée au premier plan après le tap sur la bannière',
  })
}

/**
 * Pousse la notification (simulateur) et CLIQUE sur sa bannière : SpringBoard au premier plan, `simctl push`, attente de la bannière, tap.
 * Retourne quand l'app est au premier plan.
 */
export async function pushAndTapBanner(push: SimulatedPush): Promise<void> {
  await showSpringBoard()
  simctlPush(push)
  await waitForBanner(push.title)
  await tapBanner(push.title)
}

const SETTINGS_APP = 'com.apple.Preferences'

/**
 * Bascule un interrupteur iOS désigné par sa LIGNE libellée : le tap au centre de la ligne tombe sur le texte (sans effet), le vrai contrôle étant
 * à son bord droit (constaté le 2026-10-27 ; le contrôle sans libellé, lui, se retrouvait de façon instable). Tap par coordonnées sur ce bord.
 */
async function tapSwitchRow(selector: string): Promise<void> {
  const {x, y} = await $(selector).getLocation()
  const {width, height} = await $(selector).getSize()
  await driver.execute('mobile: tap', {x: Math.round(x + width - 30), y: Math.round(y + height / 2)})
}

/**
 * App Réglages, depuis n'importe quel écran où elle a été laissée : atteint la page Apps > AMI staging > Notifications (Réglages garde
 * sa dernière position : l'ouverture depuis l'app tombe tantôt à la racine, tantôt sur la page de l'app).
 */
async function navigateToAppNotificationsSettings(): Promise<void> {
  try {
    await navigateToAppNotificationsSettingsOnce()
  } catch (err) {
    // Réglages parfois coincé (écran inattendu, constaté 1 run sur 30) : on le relance à neuf et on retente une fois.
    log.warn(`ANOMALIE : navigation dans Réglages échouée (${err instanceof Error ? err.message : String(err)}) ; Réglages relancé`)
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
    // eslint-disable-next-line wdio/no-pause -- laisser l'animation de navigation de Réglages se terminer avant de relire l'écran
    await browser.pause(1000)
  }
  if (!await done()) throw new Error('Réglages iOS : page Notifications de l\'app introuvable (Apps > AMI staging > Notifications)')
}

/** Dans l'app Réglages (page de l'app atteinte), met « Autoriser les notifications » à `on`. */
async function setOsAllowNotifications(on: boolean): Promise<void> {
  await navigateToAppNotificationsSettings()
  // L'élément est RELU à chaque fois : la page Réglages se redessine après le tap (référence périmée : « Element does not exist in cache »).
  const value = async (): Promise<string> => String(await $(iosSystemNotificationsLocators.osSettingsSwitch).getAttribute('value'))
  await $(iosSystemNotificationsLocators.osSettingsSwitch).waitForExist({timeout: 10000, timeoutMsg: 'Interrupteur « Autoriser les notifications » absent de Réglages'})
  if (await value() === (on ? '1' : '0')) return
  // La page de Réglages se redessine encore juste après son affichage : le premier tap peut viser un élément disparu (« Malformed type for
  // elementId », constaté). On retente le tap, élément relu, jusqu'à ce que la valeur change.
  await browser.waitUntil(async () => {
    if (await value().catch(() => '') === (on ? '1' : '0')) return true
    await tapSwitchRow(iosSystemNotificationsLocators.osSettingsSwitch).catch(() => undefined)
    // eslint-disable-next-line wdio/no-pause -- laisser le temps à l'interrupteur de basculer avant de relire sa valeur
    await browser.pause(800)
    return await value().catch(() => '') === (on ? '1' : '0')
  }, {timeout: 15000, interval: 300, timeoutMsg: `Interrupteur « Autoriser les notifications » de Réglages pas à ${on ? '1' : '0'}`})
}

/**
 * Accepte (`on`) ou refuse les notifications DEPUIS l'écran natif « Paramètres » d'AMI (déjà ouvert), puis constate la prise en compte
 * (simulateur : autorisation lue dans BulletinBoard). Constaté en live le 2026-10-27 (SettingsView.swift, NotificationStatus.swift) :
 *   - l'interrupteur de l'app ne lit l'autorisation système QU'AU PASSAGE EN PREMIER PLAN (scenePhase .active) : à l'ouverture de la feuille il
 *     reste à 0 même si l'autorisation est `authorized` (anomalie de l'app : constatée, cause lue dans le code). On force donc un aller-retour
 *     SpringBoard -> app avant de lire son état ;
 *   - accepter : autorisation non décidée -> alerte système « Autoriser » ; déjà autorisée -> aucun effet ; REFUSÉE -> l'app ouvre l'app Réglages (l'alerte
 *     ne se représente plus) où l'on active « Autoriser les notifications » ;
 *   - refuser : taper l'interrupteur actif ouvre l'app Réglages (l'app ne peut pas révoquer elle-même) ; on y coupe « Autoriser les notifications »
 *     (autorisation `denied`). Retour à l'app par activateApp : l'interrupteur se met à jour.
 * Sur un APPAREIL PHYSIQUE : NON EXERCÉ ici (aucun appareil) ; la lecture de BulletinBoard n'existe pas, seul l'interrupteur de l'app est contrôlé.
 */
export async function setNotificationsFromAppSettings(on: boolean): Promise<'inchangé' | 'modifié'> {
  const loc = iosSystemNotificationsLocators
  const switchOn = async (): Promise<boolean> => (await $(loc.amiSettingsSwitch).getAttribute('value').catch(() => '')) === '1'
  // Réactualiser l'interrupteur (lu au passage en premier plan seulement).
  await showSpringBoard()
  await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
  await browser.waitUntil(async () => (await $$(loc.amiSettingsTitle)).length > 0, {timeout: 10000, timeoutMsg: 'Écran « Paramètres » d\'AMI absent après le retour au premier plan'})
  const simulator = isSimulator()
  if (simulator) {
    const state = readNotificationAuthorization()
    await browser.waitUntil(async () => await switchOn() === (state === 'authorized'), {timeout: 8000, interval: 500,
      timeoutMsg: `Interrupteur d'AMI incohérent avec l'autorisation système « ${state} » après le retour au premier plan`})
  }
  if (await switchOn() === on) return 'inchangé'
  await $(loc.amiSettingsSwitch).waitForExist({timeout: 10000})
  await tapSwitchRow(loc.amiSettingsSwitch)
  if (simulator && readNotificationAuthorization() === 'notDetermined') {
    // Permission non décidée : alerte système (« Autoriser » / « Ne pas autoriser »).
    await browser.waitUntil(async () => { try { await driver.getAlertText(); return true } catch { return false } }, {timeout: 10000, interval: 300, timeoutMsg: 'Alerte système de notifications absente'})
    if (on) await driver.acceptAlert(); else await driver.dismissAlert()
  } else if (!(on && simulator && readNotificationAuthorization() === 'authorized')) {
    await browser.waitUntil(async () => (await driver.execute('mobile: queryAppState', {bundleId: SETTINGS_APP})) === 4, {timeout: 10000, interval: 500, timeoutMsg: 'L\'app Réglages n\'est pas ouverte après le tap sur l\'interrupteur'})
    await setOsAllowNotifications(on)
    if (simulator) await waitForNotificationAuthorization(on ? 'authorized' : 'denied')
    await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
  }
  await browser.waitUntil(async () => await switchOn() === on, {timeout: 10000, interval: 500, timeoutMsg: `Interrupteur d'AMI pas à « ${on ? 'actif' : 'éteint'} » après le changement`})
  return 'modifié'
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
  // Rendre la main en contexte NATIF : sinon `inWebContext` (déjà en WebView) ne choisirait plus la WebView et resterait sur celle-ci, cachée.
  await driver.switchContext('NATIVE_APP')
  return found
}
