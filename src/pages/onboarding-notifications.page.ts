import {onboardingNotificationsLocators, type OnboardingNotifLocators} from './locators/onboarding-notifications.locators'
import {nativeLocators} from '../helpers/common/pick-locators'
import {platform} from '../platform'
import {traced} from '../helpers/reporting/traced'
import {clickDisplayed, isShown} from '../helpers/spa/spa'
import {openAppRoot} from '../helpers/common/session'
import {readNotificationAuthorization} from '../helpers/mobile/ios-notifications'

/**
 * Écran d'onboarding des notifications, après la première connexion FranceConnect.
 * Android : route SPA `/#/welcome/notifications`, avec repli sur l'écran natif d'un ancien build. iOS : feuille SwiftUI.
 * Webapp : route SPA.
 */

/** L'autorisation iOS n'est pas encore décidée (ou illisible) : « Activer » ouvre alors l'alerte système. */
function isPermissionUndecided(): boolean {
    try {
        const authorization = readNotificationAuthorization()
        return authorization === 'notDetermined' || authorization === 'absente'
    } catch {
        return false
    }
}

const native = (): OnboardingNotifLocators => nativeLocators('OnboardingNotificationsPage', onboardingNotificationsLocators)

class OnboardingNotificationsPage {
    private async isWebVisible(timeout: number): Promise<boolean> {
        return await isShown(onboardingNotificationsLocators.web.heading, timeout)
    }

    private async isOnboardingVisible(timeout = 5000): Promise<boolean> {
        return await this.isWebOnboardingVisible(timeout) || await this.isNativeOnboardingVisible(timeout)
    }

    /** Partie WebView de la sonde : peut s'exécuter dans un `inWebContext` déjà ouvert. */
    async isWebOnboardingVisible(timeout = 5000): Promise<boolean> {
        if (platform().kind === 'webapp') return await this.isWebVisible(timeout)
        if (await this.isWebVisible(timeout)) return true
        return driver.isIOS && await this.isBlankWelcomeNotificationsRoute()
    }

    /** Partie native de la sonde (hors WebView) : écran natif d'un ancien build Android, bouton « plus tard » de la feuille iOS. */
    async isNativeOnboardingVisible(timeout = 5000): Promise<boolean> {
        if (platform().kind === 'webapp') return false
        const loc = native()
        return await this.firstNative(loc.dismiss, driver.isAndroid ? Math.min(timeout, 1000) : timeout) !== null
    }

    /** Ferme l'onboarding sans accorder la permission, sauf sur iOS où on l'active ; ne fait rien si l'écran est absent sous 5 s. */
    async dismiss(): Promise<void> {
        if (driver.isIOS && await this.dismissIOS()) return
        if (!await this.isOnboardingVisible()) return
        if (platform().kind === 'webapp' || (driver.isAndroid && await this.isWebVisible(1000))) {
            await clickDisplayed(onboardingNotificationsLocators.web.laterButton, {timeout: 10000})
            return
        }
        if (driver.isIOS) await this.acceptIOS()
        else await this.dismissNative()
    }

    /** iOS : traite la feuille native (permission non décidée), puis la route vide de la SPA. `true` si quelque chose a été traité. */
    private async dismissIOS(): Promise<boolean> {
        if (await this.isNativeSheetShown(3000)) {
            await this.activateNativeIOS()
            return true
        }
        return await this.leaveBlankWelcomeNotifications()
    }

    /** Sur iOS la feuille native porte l'écran : si la permission est déjà décidée, elle ne vient pas et la route de la SPA reste vide. */
    private async isBlankWelcomeNotificationsRoute(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(async () => await browser.execute(
            () => location.hash.startsWith('#/welcome/notifications') && document.body.innerText.trim() === '',
        )).catch(() => false)
    }

    /** Seule issue d'une route vide : recharger la racine, la SPA route alors vers l'accueil. */
    private async leaveBlankWelcomeNotifications(): Promise<boolean> {
        if (!await this.isBlankWelcomeNotificationsRoute()) return false
        await openAppRoot()
        return true
    }

    private async isNativeSheetShown(timeout: number): Promise<boolean> {
        return await this.firstNative(native().title, isPermissionUndecided() ? timeout : 300) !== null
    }

    /** Page de la SPA affichée : on passe par le DOM, plus fiable que l'arbre natif ; sinon feuille native seule. */
    private async acceptIOS(): Promise<void> {
        if (await this.isWebVisible(1000)) return await this.acceptIOSWebPage()
        await this.activateNativeIOS()
    }

    /** Permission non décidée : « Activer » natif ; décidée : « Activer » est sans effet, donc « Peut-être plus tard » dans le DOM. */
    private async acceptIOSWebPage(): Promise<void> {
        if (isPermissionUndecided()) return await this.activateNativeIOS()
        await clickDisplayed(onboardingNotificationsLocators.web.laterButton, {timeout: 10000})
        await this.waitForWebPageGone()
    }

    /** Sonde immédiate du titre de la feuille native, à traiter avant les pages d'onboarding de la SPA. */
    async isNativeSheetShownNow(): Promise<boolean> {
        return driver.isIOS && await this.firstNative(native().title, 0) !== null
    }

    /** Accepte l'alerte système de notifications si elle apparaît avant `timeout` ; `true` si acceptée. */
    private async acceptSystemAlert(timeout: number): Promise<boolean> {
        let alertText = null as string | null
        await browser.waitUntil(async () => {
            try { alertText = await driver.getAlertText(); return true } catch { return false }
        }, {timeout, interval: 300}).catch(() => false)
        if (!alertText) return false
        await driver.acceptAlert()
        return true
    }

    private async waitForWebPageGone(): Promise<void> {
        const gone = await browser.waitUntil(async () => !await this.isWebVisible(500) && await this.isNativeOnboardingGone(), {
            timeout: 15000, interval: 300,
        }).catch(() => false)
        if (!gone) throw new Error('Onboarding des notifications toujours affiché après la décision')
    }

    /** Active la feuille native iOS si elle est affichée (elle peut recouvrir l'accueil) ; à appeler une fois l'accueil atteint. */
    async dismissNativeSheet(timeout = 3000): Promise<boolean> {
        if (!driver.isIOS) return false
        const loc = native()
        if (await this.firstNative(loc.title, isPermissionUndecided() ? timeout : Math.min(timeout, 500)) === null) return false
        await this.activateNativeIOS()
        return true
    }

    /** iOS : « Activer » (feuille native ou page de la SPA derrière), puis « Autoriser » dans l'alerte système. */
    private async activateNativeIOS(): Promise<void> {
        const loc = native()
        const attempts = 3
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const activate = await this.firstNative(loc.activate as string, 5000)
            if (!activate) {
                if (await this.isNativeOnboardingGone()) return
                throw new Error('Bouton « Activer » introuvable sur l\'onboarding des notifications')
            }
            await activate.click()
            if (await this.acceptSystemAlert(6000)) {
                const closed = await browser.waitUntil(() => this.isNativeOnboardingGone(), {timeout: 10000, interval: 300}).catch(() => false)
                if (closed) return
                throw new Error('Onboarding des notifications toujours affiché après « Activer » et l\'alerte système')
            }
            if (await this.isNativeOnboardingGone()) return
            if (isPermissionUndecided()) continue
            return await this.dismissNative()
        }
        throw new Error('Onboarding des notifications toujours affiché après « Activer » (aucune alerte système)')
    }

    private async isNativeOnboardingGone(): Promise<boolean> {
        return (await $$(native().title)).length === 0
    }

    /** Le tap sur « Peut-être plus tard » est parfois sans effet : on retape, au plus 3 fois. */
    private async dismissNative(): Promise<void> {
        const loc = native()
        const attempts = 3
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const dismissButton = await this.firstNative(loc.dismiss, 5000)
            if (!dismissButton) {
                if (await this.isNativeOnboardingGone()) return
                throw new Error('Bouton « Peut-être plus tard » introuvable')
            }
            await dismissButton.click()
            const closed = await browser.waitUntil(() => this.isNativeOnboardingGone(), {timeout: 5000, interval: 300}).catch(() => false)
            if (closed) return
        }
        throw new Error('Écran « Activez les notifications » toujours affiché après « Peut-être plus tard »')
    }

    /** Premier élément natif de `selector` : sur iOS la feuille et la page de la SPA derrière exposent le même bouton, WDIO 10 refuse `$()` sur plusieurs. */
    private async firstNative(selector: string, timeout: number): Promise<WebdriverIO.Element | null> {
        let found = Array.from(await $$(selector))
        if (found.length === 0 && timeout > 0) {
            await browser.waitUntil(async () => {
                found = Array.from(await $$(selector))
                return found.length > 0
            }, {timeout, interval: 300}).catch(() => undefined)
        }
        return found[0] ?? null
    }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
