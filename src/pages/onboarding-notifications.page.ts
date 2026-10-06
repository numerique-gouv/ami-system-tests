import {getOnboardingNotifLocators, webOnboardingNotifLocators} from './locators/onboarding-notifications.locators'
import {platform} from '../platform'
import {traced} from '../helpers/traced'
import {tl} from '../helpers/webview'

/**
 * Page Object pour l'écran d'onboarding des notifications.
 *
 * Distinct de OnboardingPage (onboarding.page.ts) qui couvre l'onboarding d'accueil.
 * Cet écran apparaît après le premier login FC — il propose d'activer les notifications OS.
 *
 * Android : écran natif (OnboardingNotificationScreen.kt) — boutons sans resource-id stable.
 * iOS     : sheet SwiftUI (OnboardingView.swift) — sans accessibilityIdentifier.
 * Webapp  : route SPA `/#/welcome/notifications` (après OnboardingZonesPage, première connexion).
 */

class OnboardingNotificationsPage {
    /**
     * Ferme l'onboarding en tapant "Peut-être plus tard" (no-op si absent sous 5s).
     * L'écran apparaît 2-4 secondes après le login OIDC — un check instantané le raterait.
     * Après cette méthode, l'OS n'a pas accordé la permission push.
     *
     * Sur iOS, le dialog système de permission push peut apparaître avant l'écran custom
     * (selon la version iOS et l'état du simulateur) : on le refuse via dismissAlert() en
     * amont pour ne pas bloquer la détection de l'écran custom de l'app.
     *
     * waitForExist() est préféré à waitForDisplayed() pour la détection initiale :
     * sur iOS, un élément SwiftUI présent dans l'arbre XCUITest peut avoir
     * isDisplayed=false pendant l'animation d'entrée de la sheet.
     */
    /**
     * Sonde dédiée, réutilisée par HomePage.assertHomeVisible() (détection d'écran) et par
     * dismiss() elle-même (même sentinelle, un seul appel).
     */
    async isOnboardingVisible(timeout = 5000): Promise<boolean> {
        // Webapp : écran rendu par la SPA, détecté par sa route.
        if (platform().kind === 'webapp') {
            return await browser.waitUntil(
                () => driver.execute(() => /#\/welcome\/notifications/.test(location.hash)) as Promise<boolean>,
                {timeout, interval: 300}
            ).then(() => true).catch(() => false)
        }
        const loc = getOnboardingNotifLocators()
        return await $(loc.dismiss).waitForExist({timeout}).catch(() => false)
    }

    async dismiss(): Promise<void> {
        if (!await this.isOnboardingVisible()) return
        if (platform().kind === 'webapp') {
            await platform().inWebContext(async () => {
                const later = await tl().findByRole('button', {name: webOnboardingNotifLocators.laterButtonName}, {timeout: 10000})
                await later.click()
            })
            await browser.waitUntil(
                async () => !(await driver.execute(() => /#\/welcome\/notifications/.test(location.hash))),
                {timeout: 10000, interval: 300, timeoutMsg: 'Écran « Activez les notifications » toujours affiché après « Peut-être plus tard »'}
            )
            return
        }
        const loc = getOnboardingNotifLocators()
        await $(loc.dismiss).click()
        await $(loc.title).waitForDisplayed({timeout: 1000, reverse: true})
    }
}

export default traced(new OnboardingNotificationsPage(), 'OnboardingNotificationsPage')
