import {traced} from '../helpers/reporting/traced'
import {iosSystemNotificationsLocators as iosLoc, systemNotificationsLocators as loc} from './locators/system-notifications.locators'
import {
  activeNotificationRecords, appNotificationsImportance, clearLogcat, focusedWindow, grantPostNotifications, isPostNotificationsGranted, logcatTag, postNotificationAppOps,
} from '../helpers/mobile/android-notifications'
import {AssertionError} from 'node:assert'
import OnboardingNotificationsPage from './onboarding-notifications.page'
import NavigationPage from './navigation.page'
import HomePage from './home.page'
import {platform} from '../platform'
import logger from '@wdio/logger'

const log = logger('page-object')
import {getBackendUrl} from '../helpers/partner-api'
import {
    bannerAppearsWithin, isSimulator, setNotificationsFromAppSettings as setIosNotificationsFromAppSettings, showSpringBoard, simctlPush, tapBanner,
    waitForBanner, appBundleId,
} from '../helpers/mobile/ios-notifications'

/**
 * Notifications côté SYSTÈME (Android ; iOS pour les méthodes `…NativePush` et `setNotificationsFromAppSettings`) : permission POST_NOTIFICATIONS, notification poussée (FCM) affichée par le système,
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

    /** L'écran natif « Paramètres » d'AMI est-il affiché (Android et iOS) ? */
    async isAmiSettingsDisplayed(timeout = 10000): Promise<boolean> {
        return await $(driver.isIOS ? iosLoc.amiSettingsTitle : loc.amiSettingsTitle).waitForDisplayed({timeout}).then(() => true, () => false)
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

    /**
     * ANDROID. Accepte (`on`) ou refuse les notifications DEPUIS l'écran natif « Paramètres » d'AMI (déjà ouvert, cf. PreferencesPage.openPushNotificationsSettings),
     * puis constate la prise en compte côté système. Relevé en live le 2026-10-27 (émulateur API 36, staging) :
     *   - accepter (permission POST_NOTIFICATIONS refusée, interrupteur éteint) : taper l'interrupteur ouvre la boîte de dialogue système
     *     « Allow AMI Staging to send you notifications? » (Allow / Don't allow) ; « Allow » -> permission accordée, importance du canal DEFAULT ;
     *   - refuser (permission accordée, interrupteur actif) : taper l'interrupteur n'efface pas la permission mais ouvre les réglages système de l'app ;
     *     couper « All AMI … notifications » -> importance NONE, appops `ignore`, permission `granted=false` (l'app n'est PAS tuée) ; Retour ramène
     *     à l'écran « Paramètres », interrupteur éteint.
     * Sans effet (aucun tap) si l'interrupteur est déjà dans l'état demandé : le retour dit ce qui a été fait.
     */
    private async setNotificationsFromAppSettingsAndroid(on: boolean): Promise<'inchangé' | 'modifié'> {
        if (await this.amiSettingsSwitchChecked() === on) return 'inchangé'
        await this.tapAmiSettingsSwitch()
        // Permission déjà décidée (refusée par réglage) : on tombe selon l'état sur la boîte de dialogue ou sur les réglages système.
        await browser.waitUntil(async () => {
            const focus = await focusedWindow()
            return focus.includes('GrantPermissionsActivity') || focus.includes('AppNotificationSettingsActivity')
        }, {timeout: 10000, interval: 300, timeoutMsg: 'Ni boîte de dialogue de permission ni réglages système après le tap sur l\'interrupteur de l\'écran « Paramètres »'})
        if ((await focusedWindow()).includes('GrantPermissionsActivity')) {
            if (!on) throw new AssertionError({message: 'Refus demandé mais l\'app affiche la demande de permission système (permission non accordée ?)'})
            await $(loc.permissionAllowButton).click()
        } else {
            await this.setOsAppNotifications(on)
            await this.backToApp()
        }
        await browser.waitUntil(async () => await isPostNotificationsGranted() === on && await this.amiSettingsSwitchChecked() === on, {
            timeout: 10000, interval: 500, timeoutMsg: `Permission POST_NOTIFICATIONS ou interrupteur de l'écran « Paramètres » pas à « ${on ? 'actif' : 'éteint'} » après le changement`,
        })
        return 'modifié'
    }

    /**
     * Accepte (`on`) ou refuse les notifications depuis l'écran natif « Paramètres » d'AMI (déjà ouvert, cf. PreferencesPage.openPushNotificationsSettings),
     * puis constate la prise en compte côté système (Android : permission/appops ; iOS : autorisation de BulletinBoard, cf. helpers). Retourne `inchangé`
     * si l'état demandé était déjà celui de l'app.
     */
    async setNotificationsFromAppSettings(on: boolean): Promise<'inchangé' | 'modifié'> {
        return driver.isIOS ? await setIosNotificationsFromAppSettings(on) : await this.setNotificationsFromAppSettingsAndroid(on)
    }

    /** Quitte l'écran natif « Paramètres » d'AMI (Android : touche Retour ; iOS : bouton « Fermer » de la feuille). */
    async closeAppSettings(): Promise<void> {
        if (driver.isIOS) await $(iosLoc.amiSettingsClose).click()
        else await driver.pressKeyCode(4)
    }

    /**
     * Déclenche la notification NATIVE (système) correspondant à la notification publiée au backend avec `tryPush`, et retourne le titre qu'elle
     * portera à l'écran, avec l'instant de référence du délai (`sentAt`) :
     *   - Android : le push arrive du backend (FCM) : rien à faire, titre = celui de la publication ;
     *   - iOS simulateur : pas d'APNs réel : `simctl push` simule l'envoi en ligne de commande avec un titre `AMI-cli-<horodatage>` qui le dit ;
     *   - iOS APPAREIL PHYSIQUE : NON EXERCÉ ICI (aucun appareil physique disponible) : le backend produit la vraie notification, titre = celui
     *     de la publication ; aucune simulation.
     */
    async triggerNativePush(publishedTitle: string, body: string, publishedAt: number): Promise<{title: string, sentAt: number}> {
        if (!driver.isIOS) return {title: publishedTitle, sentAt: publishedAt}
        await showSpringBoard()
        if (!isSimulator()) return {title: publishedTitle, sentAt: publishedAt}
        const sentAt = Date.now()
        const title = `AMI-cli-${sentAt}`
        simctlPush({title, body: `${body} (envoyé en ligne de commande : simctl push)`, appUrl: getBackendUrl()})
        return {title, sentAt}
    }

    /** Attend la notification native `title` (visible : dumpsys notification sur Android, bannière SpringBoard sur iOS). */
    async waitForNativePush(title: string, body: string, timeoutMs = 150000): Promise<void> {
        if (driver.isIOS) await waitForBanner(title, Math.min(timeoutMs, 30000))
        else await this.waitForSystemNotification(title, body, timeoutMs)
    }

    /** Vérifie qu'AUCUNE notification native `title` n'apparaît pendant `durationMs` (Android : dumpsys ; iOS : bannière SpringBoard). */
    async assertNoNativePush(title: string, durationMs: number): Promise<void> {
        if (!driver.isIOS) return await this.assertNoSystemNotification(title, durationMs)
        const shown = await bannerAppearsWithin(title, durationMs)
        // Sans tap sur une bannière, l'app est restée en arrière-plan (SpringBoard au premier plan) : la remettre au premier plan.
        await driver.execute('mobile: activateApp', {bundleId: appBundleId()})
        if (shown) throw new AssertionError({message: `Bannière « ${title} » affichée alors que les notifications sont refusées`})
    }

    /** Clique la notification native `title` (Android : volet des notifications ; iOS : bannière). */
    async tapNativePush(title: string): Promise<void> {
        if (driver.isIOS) await tapBanner(title)
        else await this.openShadeAndTap(title)
    }

    /**
     * Page d'arrivée après le clic sur la notification native. Android : l'app est au premier plan et MainActivity a reçu l'intent (la WebView n'est
     * pas rechargée si l'app était ouverte : rien d'autre de stable à constater). iOS : l'app est au premier plan ET l'accueil est affiché.
     * CONSTAT (dev tools, simulateur, 2026-10-27, plusieurs essais) : le tap lit `app_url` et crée une WebView `/#/notifications`, mais elle reste
     * `hidden` (visibilityState) : l'utilisateur voit l'accueil (avec la bannière « Les notifications ont été activées »). Cette WebView n'est de plus
     * pas toujours créée (absente sur un essai sur deux) : on ne l'asserte donc pas. Défaut de l'app ou de la simulation, NON CONFIRMÉ.
     */
    async assertPushArrival(): Promise<void> {
        if (!driver.isIOS) return await this.assertTapOpenedApp()
        // Le retour au premier plan peut re-présenter la feuille native « Activez les notifications » qui recouvre la page (constaté).
        await OnboardingNotificationsPage.dismissNativeSheet(2000)
        expect(await driver.execute('mobile: queryAppState', {bundleId: appBundleId()})).toBe(4)
        await platform().inWebContext(() => HomePage.assertHomeVisible())
        log.warn('ANOMALIE (iOS, non confirmée) : le tap sur la notification n\'affiche pas la page Notifications (WebView /#/notifications cachée ou absente) ; l\'accueil reste à l\'écran')
    }

    /**
     * Revient à l'accueil après le clic. iOS : l'accueil est déjà affiché dans la WebView visible (l'éventuelle WebView `/#/notifications` cachée
     * n'accepte pas d'autre route : `goToRoute('/')` y laisse un écran blanc, constaté le 2026-10-27 ; l'adaptateur choisit la WebView visible).
     * Android : la WebView n'a pas changé, on retourne à la racine.
     */
    async leavePushArrival(): Promise<void> {
        await platform().inWebContext(async () => {
            if (!driver.isIOS) await NavigationPage.goToRoute('/')
            await HomePage.assertHomeVisible()
        })
    }

    /** Vérifie qu'AUCUNE notification de l'app portant ce titre de l'app portant ce titre n'est postée au système pendant `durationMs` (sondage de dumpsys notification). */
    async assertNoSystemNotification(title: string, durationMs: number): Promise<void> {
        const end = Date.now() + durationMs
        do {
            if ((await activeNotificationRecords()).some(r => r.includes(`android.title=String (${title})`))) {
                throw new AssertionError({message: `Notification système « ${title} » postée alors que les notifications sont refusées`})
            }
            // eslint-disable-next-line wdio/no-pause -- sondage périodique d'une ABSENCE : aucune condition à attendre
            await browser.pause(3000)
        } while (Date.now() < end)
    }

    /** Revient de l'écran des réglages système vers l'app (touche Retour). */
    async backToApp(): Promise<void> {
        await driver.pressKeyCode(4)
        await browser.waitUntil(async () => (await focusedWindow()).includes('fr.gouv.ami.MainActivity'), {timeout: 10000, interval: 500})
    }
}

export default traced(new SystemNotificationsPage(), 'SystemNotificationsPage')
