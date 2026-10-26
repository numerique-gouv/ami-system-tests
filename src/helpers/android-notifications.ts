/**
 * Constat, côté SYSTÈME Android, des notifications et de leur permission (Android 13+ : POST_NOTIFICATIONS).
 * Passe par `mobile: shell` du driver UiAutomator2, activé par `uiautomator2:adb_shell` dans wdio.android.conf.ts (README appium-uiautomator2-driver).
 * Android seulement : à n'appeler que si `driver.isAndroid`.
 */
import {androidCapabilities} from '../driver/capabilities'

export const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS'

/** Exécute une commande shell sur l'appareil (`adb shell <command> <args…>`) et retourne sa sortie standard. */
export async function adbShell(command: string, args: string[] = [], timeout = 20000): Promise<string> {
  return String(await driver.execute('mobile: shell', {command, args, timeout}))
}

/** Package de l'app testée : celui des capabilities (la session Appium ne le renvoie pas dans `driver.capabilities`, constaté le 2026-10-26). */
export function appPackage(): string {
  return androidCapabilities['appium:appPackage'] as string
}

/**
 * Ligne `android.permission.POST_NOTIFICATIONS: granted=<bool>, flags=[…]` de l'app dans `dumpsys package <pkg>` (section « runtime permissions »
 * de l'utilisateur 0). La sortie contient aussi les lignes des AUTRES packages (liste des titulaires de la permission) : on ne lit donc qu'à
 * partir de `Package [<pkg>]`.
 */
export async function postNotificationsPermissionLine(pkg = appPackage()): Promise<string | undefined> {
  const out = await adbShell('dumpsys', ['package', pkg], 30000)
  const section = out.slice(Math.max(0, out.indexOf(`Package [${pkg}]`)))
  return section.match(new RegExp(`${POST_NOTIFICATIONS}: granted=[^\\n]*`))?.[0]
}

/** true si la permission POST_NOTIFICATIONS est accordée à l'app. */
export async function isPostNotificationsGranted(pkg = appPackage()): Promise<boolean> {
  return (await postNotificationsPermissionLine(pkg))?.includes('granted=true') ?? false
}

/** Accorde la permission de façon déterministe (équivalent de la boîte de dialogue système « Autoriser »). */
export async function grantPostNotifications(pkg = appPackage()): Promise<void> {
  await adbShell('pm', ['grant', pkg, POST_NOTIFICATIONS])
}

/** Notifications actives de l'app (blocs `NotificationRecord` de `dumpsys notification --noredact` dont le package est `pkg`). */
export async function activeNotificationRecords(pkg = appPackage()): Promise<string[]> {
  const out = await adbShell('dumpsys', ['notification', '--noredact'], 30000)
  return out.split(/(?=\n\s*NotificationRecord\()/).filter(b => b.includes(`pkg=${pkg}`) && b.includes('NotificationRecord('))
}

/** Fenêtre qui a le focus (`dumpsys window`, ligne mCurrentFocus), ex. `…fr.gouv.ami.staging/fr.gouv.ami.MainActivity}`. */
export async function focusedWindow(): Promise<string> {
  const out = await adbShell('dumpsys', ['window'], 30000)
  return out.split('\n').find(l => l.includes('mCurrentFocus'))?.trim() ?? ''
}

/** Importance du canal par défaut de l'app vue du système (`AppSettings: <pkg> (<uid>) importance=DEFAULT|NONE…` de `dumpsys notification`) : NONE = notifications coupées. */
export async function appNotificationsImportance(pkg = appPackage()): Promise<string | undefined> {
  const out = await adbShell('dumpsys', ['notification', '--noredact'], 30000)
  return out.match(new RegExp(`AppSettings: ${pkg.replace(/\./g, '\\.')} \\(\\d+\\) importance=(\\w+)`))?.[1]
}

/** Mode appops de la permission POST_NOTIFICATION : `ignore` = refusée, `allow`/« No operations » (mode par défaut) = permise. */
export async function postNotificationAppOps(pkg = appPackage()): Promise<string> {
  return (await adbShell('appops', ['get', pkg, 'POST_NOTIFICATION'])).replace(/\n/g, ' ').trim()
}

/** Journal logcat (tampon courant) restreint à une balise, en niveau debug. */
export async function logcatTag(tag: string): Promise<string> {
  return await adbShell('logcat', ['-d', '-s', `${tag}:D`], 30000)
}

/** Vide le tampon logcat (pour ne lire ensuite que les lignes causées par la prochaine action). */
export async function clearLogcat(): Promise<void> {
  await adbShell('logcat', ['-c'])
}
