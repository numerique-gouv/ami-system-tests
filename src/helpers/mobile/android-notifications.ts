// Constat des notifications et de leur permission côté système Android, par `mobile: shell` (activé par `uiautomator2:adb_shell` dans wdio.android.conf.ts).
import {androidCapabilities} from '../../driver/capabilities'

export const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS'

async function adbShell(command: string, args: string[] = [], timeout = 20000): Promise<string> {
  return String(await driver.execute('mobile: shell', {command, args, timeout}))
}

/** Package de l'app testée, lu dans les capabilities de configuration (la session Appium ne le renvoie pas). */
export function appPackage(): string {
  return androidCapabilities['appium:appPackage'] as string
}

/** Ligne `POST_NOTIFICATIONS: granted=…` de l'app dans `dumpsys package` : on ne lit qu'à partir de `Package [<pkg>]`, la sortie listant aussi les autres packages. */
async function postNotificationsPermissionLine(pkg = appPackage()): Promise<string | undefined> {
  const out = await adbShell('dumpsys', ['package', pkg], 30000)
  const section = out.slice(Math.max(0, out.indexOf(`Package [${pkg}]`)))
  return section.match(new RegExp(`${POST_NOTIFICATIONS}: granted=[^\\n]*`))?.[0]
}

export async function isPostNotificationsGranted(pkg = appPackage()): Promise<boolean> {
  return (await postNotificationsPermissionLine(pkg))?.includes('granted=true') ?? false
}

/** Blocs `NotificationRecord` de `dumpsys notification` appartenant à l'app. */
export async function activeNotificationRecords(pkg = appPackage()): Promise<string[]> {
  const out = await adbShell('dumpsys', ['notification', '--noredact'], 30000)
  return out.split(/(?=\n\s*NotificationRecord\()/).filter(b => b.includes(`pkg=${pkg}`) && b.includes('NotificationRecord('))
}

/** Ligne mCurrentFocus de `dumpsys window`. */
export async function focusedWindow(): Promise<string> {
  const out = await adbShell('dumpsys', ['window'], 30000)
  return out.split('\n').find(l => l.includes('mCurrentFocus'))?.trim() ?? ''
}

export async function logcatTag(tag: string): Promise<string> {
  return await adbShell('logcat', ['-d', '-s', `${tag}:D`], 30000)
}

export async function clearLogcat(): Promise<void> {
  await adbShell('logcat', ['-c'])
}
