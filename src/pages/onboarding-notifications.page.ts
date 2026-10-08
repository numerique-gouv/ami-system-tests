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
        const nativeShown = await $(loc.dismiss).waitForExist({timeout: driver.isAndroid ? 1000 : timeout}).catch(() => false)
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
        await $(loc.dismiss).click()
        await $(loc.title).waitForDisplayed({timeout: 5000, reverse: true})
    }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
