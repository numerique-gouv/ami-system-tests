import {getOnboardingNotifLocators, webOnboardingNotifLocators} from './locators/onboarding-notifications.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import logger from '@wdio/logger'
import {findRole} from '../helpers/spa'

/**
 * Page Object pour l'écran d'onboarding des notifications.
 *
 * Cet écran apparaît après le premier login FC — il propose d'activer les notifications OS.
 *
 * Android : écran natif (OnboardingNotificationScreen.kt) — boutons sans resource-id stable.
 * iOS     : sheet SwiftUI (OnboardingView.swift) — sans accessibilityIdentifier.
 * Webapp  : route SPA `/#/welcome/notifications` (après OnboardingZonesPage, première connexion).
 */

const log = logger('page-object')

class OnboardingNotificationsPage {
    /**
     * Route SPA `/#/welcome/notifications` affichée ? Sonde dédiée au contexte WebView/DOM
     * (quasi-identité en webapp, cf. platform().inWebContext()).
     */
    private async isWebRouteVisible(timeout: number): Promise<boolean> {
        if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return false
        return await browser.waitUntil(
            () => platform().inWebContext(
                () => driver.execute(() => /#\/welcome\/notifications/.test(location.hash)) as Promise<boolean>
            ),
            {timeout, interval: 300}
        ).then(() => true).catch(() => false)
    }

    /**
     * Sonde dédiée, réutilisée par HomePage.assertHomeVisible() (détection d'écran) et par
     * dismiss() elle-même (même sentinelle, un seul appel).
     *
     * Depuis la SPA d'octobre 2026, l'écran est rendu par la WebView sur Android aussi (observé
     * 2026-10-06 : au moment où il est affiché, l'arbre natif ne contient aucun texte alors que
     * l'URL de la WebView est `#/welcome/notifications`). Android passe donc par la route SPA comme
     * la webapp, avec repli sur l'écran natif (OnboardingNotificationScreen.kt) pour un ancien
     * build ; iOS reste sur la sheet SwiftUI.
     */
    async isOnboardingVisible(timeout = 5000): Promise<boolean> {
        if (platform().kind === 'webapp') return await this.isWebRouteVisible(timeout)
        if (driver.isAndroid && await this.isWebRouteVisible(timeout)) return true
        const loc = getOnboardingNotifLocators()
        const nativeShown = await this.firstNative(loc.dismiss, driver.isAndroid ? 1000 : timeout) !== null
        // Android : le chemin nominal est la route SPA (observée sur l'émulateur moderne). L'écran natif
        // (OnboardingNotificationScreen.kt) est un ÉCART, à voir dans les logs ; on le traite pour que le test continue.
        if (nativeShown && driver.isAndroid) {
            log.warn('ANOMALIE (Android) : onboarding des notifications affiché en NATIF au lieu de la route SPA ' +
                '#/welcome/notifications (chemin nominal). Écart d\'appareil/WebView probable : non confirmé.')
        }
        return nativeShown
    }

    /**
     * Ferme l'onboarding en tapant « Peut-être plus tard » (no-op si l'écran est absent sous 5 s).
     * L'écran apparaît 2-4 secondes après le login OIDC — un check instantané le raterait.
     * Après cette méthode, l'OS n'a pas accordé la permission push.
     *
     * waitForExist() est préféré à waitForDisplayed() pour la détection initiale de l'écran natif :
     * sur iOS, un élément SwiftUI présent dans l'arbre XCUITest peut avoir
     * isDisplayed=false pendant l'animation d'entrée de la sheet.
     */
    async dismiss(): Promise<void> {
        if (!await this.isOnboardingVisible()) return
        if (platform().kind === 'webapp' || (driver.isAndroid && await this.isWebRouteVisible(1000))) {
            await platform().inWebContext(async () => {
                const later = await findRole('button', webOnboardingNotifLocators.laterButtonName, {timeout: 10000})
                await later.click()
            })
            await browser.waitUntil(
                () => platform().inWebContext(
                    async () => !(await driver.execute(() => /#\/welcome\/notifications/.test(location.hash)))
                ),
                {timeout: 10000, interval: 300, timeoutMsg: 'Écran « Activez les notifications » toujours affiché après « Peut-être plus tard »'}
            )
            return
        }
        const loc = getOnboardingNotifLocators()
        const dismissButton = await this.firstNative(loc.dismiss, 5000)
        if (!dismissButton) throw new Error('Bouton « Peut-être plus tard » introuvable')
        await dismissButton.click()
        await browser.waitUntil(async () => (await $$(loc.title)).length === 0, {
            timeout: 5000, interval: 300, timeoutMsg: 'Écran « Activez les notifications » toujours affiché après « Peut-être plus tard »',
        })
    }

    /**
     * Premier élément natif qui correspond à `selector` (attend jusqu'à `timeout`), ou `null`. WDIO 10 refuse `$()`
     * quand plusieurs éléments correspondent ; sur iOS la feuille native et la page de la SPA derrière elle exposent
     * le même bouton (cf. locators) : on prend le premier et on le signale, sans critère natif/WebView ni position.
     */
    private async firstNative(selector: string, timeout: number): Promise<WebdriverIO.Element | null> {
        let found: WebdriverIO.Element[] = []
        await browser.waitUntil(async () => {
            found = Array.from(await $$(selector))
            return found.length > 0
        }, {timeout, interval: 300}).catch(() => undefined)
        if (found.length > 1) {
            log.warn(`ANOMALIE : ${found.length} éléments natifs correspondent à « ${selector} » (feuille native et page de la SPA ` +
                'superposées, même libellé) ; on prend le premier. Aucun identifiant ne les distingue (constaté sur iOS, 2026-10-08).')
        }
        return found[0] ?? null
    }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
