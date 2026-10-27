import {traced} from '../helpers/reporting/traced'
import {systemNotificationsLocators as loc} from './locators/system-notifications.locators'
import {
  activeNotificationRecords, appNotificationsImportance, clearLogcat, focusedWindow, grantPostNotifications, isPostNotificationsGranted, logcatTag, postNotificationAppOps,
} from '../helpers/mobile/android-notifications'
import {AssertionError} from 'node:assert'

/**
 * Notifications côté SYSTÈME Android (Android seulement) : permission POST_NOTIFICATIONS, notification poussée (FCM) affichée par le système,
 * écran natif « Paramètres » d'AMI et réglages système de l'app. Constats via `mobile: shell` (cf. helpers/mobile/android-notifications.ts).
 *
 * Faits relevés en live le 2026-10-26 (émulateur API 36, staging) :
 *   - la notification n'est postée par l'app (FirebaseService.onMessageReceived) QUE si POST_NOTIFICATIONS est accordée ; elle arrive ~20 s
 *     après la publication (FCM) et son id est fixe (0) : une nouvelle notification remplace la précédente ;
 *   - le clic démarre MainActivity avec les extras `sender`, `app_url`, `title`, `message` (onNewIntent), visibles dans logcat.
 */
class SystemNotificationsPage {
    /** Accorde la permission (équivalent de « Autoriser » dans la boîte de dialogue système) sans tuer l'app, puis la vérifie. */
    async grantPermission(): Promise<void> {
        await grantPostNotifications()
        if (!await isPostNotificationsGranted()) throw new AssertionError({message: 'POST_NOTIFICATIONS non accordée après `pm grant`'})
    }

    async isPermissionGranted(): Promise<boolean> {
        return await isPostNotificationsGranted()
    }

    /**
     * Attend que le système ait une notification de l'app portant ce titre ET ce texte (dumpsys notification) ; retourne l'enregistrement.
     * Délai de 150 s : la livraison FCM a été mesurée entre 45 et 70 s sur l'émulateur (5 runs du 2026-10-27, un à 69,7 s), donc 90 s était trop juste.
     */
    async waitForSystemNotification(title: string, body: string, timeoutMs = 150000): Promise<string> {
        let found = ''
        await browser.waitUntil(async () => {
            found = (await activeNotificationRecords()).find(r => r.includes(`android.title=String (${title})`)) ?? ''
            return found !== ''
        }, {timeout: timeoutMs, interval: 3000, timeoutMsg: `Notification système « ${title} » absente de dumpsys notification après ${timeoutMs}ms`})
        if (!found.includes(`android.text=String (${body})`)) throw new AssertionError({message: `Notification système « ${title} » sans le texte « ${body} »`})
        return found
    }

    /** Ouvre le volet des notifications, tape la notification `title` (la ferme : AUTO_CANCEL) ; referme le volet si elle est introuvable. */
    async openShadeAndTap(title: string): Promise<void> {
        await driver.openNotifications()
        await clearLogcat() // le tampon ne doit contenir que les lignes causées par ce clic
        const item = $(loc.shadeNotification(title))
        try {
            await item.waitForDisplayed({timeout: 15000, timeoutMsg: `Notification « ${title} » absente du volet des notifications`})
        } catch (e) {
            await driver.pressKeyCode(4) // BACK : referme le volet
            throw e
        }
        await item.click()
    }

    /**
     * Après le clic : l'app est au premier plan et a reçu l'intent de la notification (`onNewIntent` de MainActivity, avec `sender` et `app_url`).
     * Les extras ne sont PAS comparés au titre cliqué : le `PendingIntent` de FirebaseService (requestCode 0, intent égal, sans UPDATE_CURRENT)
     * est réutilisé d'une notification à l'autre, donc les extras sont ceux de la PREMIÈRE notification de l'app (constaté le 2026-10-26 :
     * le clic sur « AMI-push-… » a livré le titre « AMI-vanilla-… »). À confirmer côté app Android.
     */
    async assertTapOpenedApp(): Promise<void> {
        await browser.waitUntil(async () => (await focusedWindow()).includes('fr.gouv.ami.MainActivity'), {
            timeout: 10000, interval: 500, timeoutMsg: 'MainActivity n\'a pas le focus après le clic sur la notification',
        })
        await browser.waitUntil(async () => /onNewIntent: baseUrl from the intent: https:\/\//.test(await logcatTag('MainActivity')), {
            timeout: 10000, interval: 500, timeoutMsg: 'MainActivity n\'a reçu aucun intent (app_url) après le clic sur la notification',
        })
    }

    /** L'écran natif « Paramètres » d'AMI est-il affiché ? */
    async isAmiSettingsDisplayed(timeout = 10000): Promise<boolean> {
        return await $(loc.amiSettingsTitle).waitForDisplayed({timeout}).then(() => true, () => false)
    }

    /** État de l'interrupteur de l'écran natif « Paramètres » (reflète la permission POST_NOTIFICATIONS). */
    async amiSettingsSwitchChecked(): Promise<boolean> {
        return (await $(loc.amiSettingsSwitch).getAttribute('checked')) === 'true'
    }

    /** Tape l'interrupteur de l'écran natif « Paramètres » (permission accordée : ouvre les réglages système ; sinon : demande de permission). */
    async tapAmiSettingsSwitch(): Promise<void> {
        await $(loc.amiSettingsSwitch).click()
    }

    /** Les réglages système de notifications de l'app sont-ils au premier plan ? */
    async isOsAppNotificationSettingsFocused(timeout = 10000): Promise<boolean> {
        return await browser.waitUntil(async () => (await focusedWindow()).includes('AppNotificationSettingsActivity'), {timeout, interval: 500}).then(() => true, () => false)
    }

    /** Tape « All <app> notifications » dans les réglages système et attend que l'interrupteur ait la valeur `on`. */
    async setOsAppNotifications(on: boolean): Promise<void> {
        const sw = $(loc.osAppNotificationsSwitch)
        await sw.waitForDisplayed({timeout: 10000})
        if ((await sw.getAttribute('checked')) === String(on)) return
        await sw.click()
        await browser.waitUntil(async () => (await $(loc.osAppNotificationsSwitch).getAttribute('checked')) === String(on), {timeout: 5000, interval: 300})
    }

    /** Vue système des notifications de l'app : importance du canal (`NONE` = coupées) et mode appops de POST_NOTIFICATION. */
    async osState(): Promise<{importance: string | undefined, appOps: string}> {
        return {importance: await appNotificationsImportance(), appOps: await postNotificationAppOps()}
    }

    /** Revient de l'écran des réglages système vers l'app (touche Retour). */
    async backToApp(): Promise<void> {
        await driver.pressKeyCode(4)
        await browser.waitUntil(async () => (await focusedWindow()).includes('fr.gouv.ami.MainActivity'), {timeout: 10000, interval: 500})
    }
}

export default traced(new SystemNotificationsPage(), 'SystemNotificationsPage')
