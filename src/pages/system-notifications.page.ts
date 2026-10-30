import {traced} from '../helpers/reporting/traced'
import {systemNotificationsLocators} from './locators/system-notifications.locators'
import {
  activeNotificationRecords, clearLogcat, focusedWindow, isPostNotificationsGranted, logcatTag,
} from '../helpers/mobile/android-notifications'
import {AssertionError} from 'node:assert'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import NavigationPage from './navigation.page'
import HomePage from './home.page'
import {platform} from '../platform'
import {
    bannerAppearsWithin, setNotificationsFromAppSettings as setIosNotificationsFromAppSettings, showSpringBoard, tapBanner,
    waitForBanner, appBundleId, waitForNotificationAuthorization,
} from '../helpers/mobile/ios-notifications'

/**
 * Notifications côté système : permission POST_NOTIFICATIONS, notification poussée affichée par le système (Android : volet ; iOS : bannière),
 * écran natif « Paramètres » d'AMI et réglages système de l'app. Constats Android via `mobile: shell`.
 * Les OS ne se pilotent pas de la même façon : cette page branche sur `driver.isIOS` / `driver.isAndroid` pour appeler l'utilitaire du bon OS.
 */
class SystemNotificationsPage {
    /** iOS : l'onboarding accepte les notifications, ce que le simulateur confirme. Sans effet sur Android. */
    async assertAuthorizedAfterOnboarding(): Promise<void> {
        if (driver.isIOS) await waitForNotificationAuthorization('authorized')
    }

    /** Attend une notification de l'app portant ce titre ET ce texte (dumpsys notification). */
    private async waitForSystemNotification(title: string, body: string, timeoutMs: number): Promise<void> {
        let found = ''
        await browser.waitUntil(async () => {
            found = (await activeNotificationRecords()).find(r => r.includes(`android.title=String (${title})`)) ?? ''
            return found !== ''
        }, {timeout: timeoutMs, interval: 3000, timeoutMsg: `Notification système « ${title} » absente de dumpsys notification après ${timeoutMs}ms`})
        if (!found.includes(`android.text=String (${body})`)) throw new AssertionError({message: `Notification système « ${title} » sans le texte « ${body} »`})
    }

    /** Ouvre le volet des notifications et tape la notification `title` ; referme le volet si elle est introuvable. */
    private async openShadeAndTap(title: string): Promise<void> {
        await driver.openNotifications()
        await clearLogcat()
        const item = $(systemNotificationsLocators.android.shadeNotification(title))
        try {
            await item.waitForDisplayed({timeout: 15000, timeoutMsg: `Notification « ${title} » absente du volet des notifications`})
        } catch (e) {
            await driver.pressKeyCode(4)
            throw e
        }
        await item.click()
    }

    /** L'app est au premier plan et MainActivity a reçu l'intent de la notification. Ses extras ne sont pas comparés au titre cliqué. */
    private async assertTapOpenedApp(): Promise<void> {
        await browser.waitUntil(async () => (await focusedWindow()).includes('fr.gouv.ami.MainActivity'), {
            timeout: 10000, interval: 500, timeoutMsg: 'MainActivity n\'a pas le focus après le clic sur la notification',
        })
        await browser.waitUntil(async () => /onNewIntent: baseUrl from the intent: https:\/\//.test(await logcatTag('MainActivity')), {
            timeout: 10000, interval: 500, timeoutMsg: 'MainActivity n\'a reçu aucun intent (app_url) après le clic sur la notification',
        })
    }

    /** L'écran natif « Paramètres » d'AMI est-il affiché ? */
    async isAmiSettingsDisplayed(timeout = 10000): Promise<boolean> {
        return await $(driver.isIOS ? systemNotificationsLocators.ios.amiSettingsTitle : systemNotificationsLocators.android.amiSettingsTitle).waitForDisplayed({timeout}).then(() => true, () => false)
    }

    private async amiSettingsSwitchChecked(): Promise<boolean> {
        return (await $(systemNotificationsLocators.android.amiSettingsSwitch).getAttribute('checked')) === 'true'
    }

    /** Tape « All <app> notifications » dans les réglages système et attend que l'interrupteur ait la valeur `on`. */
    private async setOsAppNotifications(on: boolean): Promise<void> {
        const sw = $(systemNotificationsLocators.android.osAppNotificationsSwitch)
        await sw.waitForDisplayed({timeout: 10000})
        if ((await sw.getAttribute('checked')) === String(on)) return
        await sw.click()
        await browser.waitUntil(async () => (await $(systemNotificationsLocators.android.osAppNotificationsSwitch).getAttribute('checked')) === String(on), {timeout: 5000, interval: 300})
    }

    /**
     * Android. Accepter ouvre la boîte de dialogue système de permission, refuser ouvre les réglages système de l'app où l'on coupe
     * « All <app> notifications ». Aucun tap si l'interrupteur est déjà dans l'état demandé.
     */
    private async setNotificationsFromAppSettingsAndroid(on: boolean): Promise<'inchangé' | 'modifié'> {
        if (await this.amiSettingsSwitchChecked() === on) return 'inchangé'
        await $(systemNotificationsLocators.android.amiSettingsSwitch).click()
        await browser.waitUntil(async () => {
            const focus = await focusedWindow()
            return focus.includes('GrantPermissionsActivity') || focus.includes('AppNotificationSettingsActivity')
        }, {timeout: 10000, interval: 300, timeoutMsg: 'Ni boîte de dialogue de permission ni réglages système après le tap sur l\'interrupteur'})
        if ((await focusedWindow()).includes('GrantPermissionsActivity')) {
            if (!on) throw new AssertionError({message: 'Refus demandé mais l\'app affiche la demande de permission système'})
            await $(systemNotificationsLocators.android.permissionAllowButton).click()
        } else {
            await this.setOsAppNotifications(on)
            await this.backToApp()
        }
        await browser.waitUntil(async () => await isPostNotificationsGranted() === on && await this.amiSettingsSwitchChecked() === on, {
            timeout: 10000, interval: 500, timeoutMsg: `Permission POST_NOTIFICATIONS ou interrupteur pas à « ${on ? 'actif' : 'éteint'} »`,
        })
        return 'modifié'
    }

    /** Accepte (`on`) ou refuse les notifications depuis l'écran natif « Paramètres » d'AMI (déjà ouvert) et constate la prise en compte côté système. */
    async setNotificationsFromAppSettings(on: boolean): Promise<'inchangé' | 'modifié'> {
        return driver.isIOS ? await setIosNotificationsFromAppSettings(on) : await this.setNotificationsFromAppSettingsAndroid(on)
    }

    /** Android : touche Retour ; iOS : bouton « Fermer » de la feuille. */
    async closeAppSettings(): Promise<void> {
        if (driver.isIOS) await $(systemNotificationsLocators.ios.amiSettingsClose).click()
        else await driver.pressKeyCode(4)
    }

    /** Attend la notification native émise par le backend (Android : dumpsys notification ; iOS : bannière de SpringBoard). */
    async waitForNativePush(title: string, body: string, timeoutMs = 150000): Promise<void> {
        if (driver.isIOS) {
            await showSpringBoard()
            await waitForBanner(title, timeoutMs)
        } else await this.waitForSystemNotification(title, body, timeoutMs)
    }

    /** Aucune notification native `title` pendant `durationMs`. */
    async assertNoNativePush(title: string, durationMs: number): Promise<void> {
        if (!driver.isIOS) return await this.assertNoSystemNotification(title, durationMs)
        await showSpringBoard()
        const shown = await bannerAppearsWithin(title, durationMs)
        await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
        if (shown) throw new AssertionError({message: `Bannière « ${title} » affichée alors que les notifications sont refusées`})
    }

    /** Android : volet des notifications ; iOS : bannière. */
    async tapNativePush(title: string): Promise<void> {
        if (driver.isIOS) await tapBanner(title)
        else await this.openShadeAndTap(title)
    }

    /**
     * Après le clic sur la notification native. Android : MainActivity a reçu l'intent. iOS : l'app est au premier plan et l'accueil affiché ;
     * sur staging la page Notifications n'est pas affichée par l'app, donc pas d'assertion plus forte.
     */
    async assertPushArrival(): Promise<void> {
        if (!driver.isIOS) return await this.assertTapOpenedApp()
        await OnboardingNotificationsPage.dismissNativeSheet(2000)
        expect(await driver.execute('mobile: queryAppState', {bundleId: appBundleId()})).toBe(4)
        await platform().inWebContext(() => HomePage.assertDisplayed())
    }

    /** Revient à l'accueil après le clic. iOS : l'accueil est déjà dans la WebView visible ; Android : retour à la racine. */
    async leavePushArrival(): Promise<void> {
        await platform().inWebContext(async () => {
            if (!driver.isIOS) await NavigationPage.goToRoute('/')
            await HomePage.assertDisplayed()
        })
    }

    private async assertNoSystemNotification(title: string, durationMs: number): Promise<void> {
        const end = Date.now() + durationMs
        do {
            if ((await activeNotificationRecords()).some(r => r.includes(`android.title=String (${title})`))) {
                throw new AssertionError({message: `Notification système « ${title} » postée alors que les notifications sont refusées`})
            }
            // eslint-disable-next-line wdio/no-pause -- sondage périodique d'une absence : aucune condition à attendre
            await browser.pause(3000)
        } while (Date.now() < end)
    }

    private async backToApp(): Promise<void> {
        await driver.pressKeyCode(4)
        await browser.waitUntil(async () => (await focusedWindow()).includes('fr.gouv.ami.MainActivity'), {timeout: 10000, interval: 500})
    }
}

export default traced(new SystemNotificationsPage(), 'SystemNotificationsPage')
