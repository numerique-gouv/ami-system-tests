import {preferencesLocators} from './locators/preferences.locators'
import {traced} from '../helpers/reporting/traced'
import {checkboxStates, clickButton, pageText, setCheckbox, visibleButtonTexts, waitForHeading, waitForPageText} from '../helpers/spa/spa'
import NavigationPage from './navigation.page'
import type {PartnerId} from '../helpers/partner-api'

/**
 * Page Object de Préférences : suivi des démarches, notifications, zones scolaires.
 *
 * Deux réglages à ne pas confondre :
 *   - les cases « Suivi des démarches » : consentement aux DÉMARCHES, un par partenaire (méthodes `…DemarchesConsent…`) ; refusé, le
 *     backend refuse les événements du partenaire (cf. helpers/partner-api/consent.ts) ;
 *   - le réglage « Notifications » (méthodes `…PushNotifications…`) : notifications PUSH, GLOBAL à AMI (pas par partenaire), local à
 *     l'app, sans endpoint ; son effet dépend de la permission du système (navigateur, Android ; iOS : appareil physique seulement).
 */
class PreferencesPage {
    async open(): Promise<void> {
        await NavigationPage.openPlusEntry('Préférences')
    }

    /** Vérifie l'arrivée sur la page Préférences (titre). */
    async assertDisplayed(): Promise<void> {
        await waitForHeading(preferencesLocators.pageTitle)
    }

    async entries(): Promise<string[]> {
        await this.assertDisplayed()
        const texts = await visibleButtonTexts()
        return texts.filter(t => preferencesLocators.entries.includes(t))
    }

    async openDemarchesConsents(): Promise<void> {
        await clickButton(preferencesLocators.entries[0])
    }

    async openPushNotificationsSettings(): Promise<void> {
        await clickButton(preferencesLocators.entries[1])
    }

    /** Clique l'entrée « Zones scolaires », qui ouvre la page `/#/preferences/zones` (vérifiée par `ZonesPage.assertDisplayed()`). */
    async openZones(): Promise<void> {
        await clickButton(preferencesLocators.entries[2])
    }

    /** Vérifie l'arrivée sur la page des préférences de notifications (titre). */
    async assertNotificationsDisplayed(): Promise<void> {
        await waitForHeading(preferencesLocators.notificationsTitle)
    }

    /** États des cases de consentement aux DÉMARCHES par identifiant de partenaire (`name`), sans les modifier. */
    async demarchesConsentStates(): Promise<Record<string, boolean>> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        return await checkboxStates()
    }

    /** Coche ou décoche le consentement aux DÉMARCHES du partenaire `partner` (attribut `name` : `dinum-ami`, `dinum-dn`, `dinum-rdvsp`, `psl`) et attend l'état. */
    async setDemarchesConsent(partner: PartnerId, checked: boolean): Promise<void> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        await setCheckbox(partner, checked)
    }

    /** Clique « Tout suivre » : active les consentements aux démarches de tous les partenaires. */
    async followAllDemarches(): Promise<void> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        await clickButton(preferencesLocators.followAllDemarchesName)
    }

    /**
     * Remet les consentements aux démarches dans l'état `states` (clé = `name`/`id` de la case), en ne touchant qu'à ceux qui diffèrent. Toutes les
     * cases du snapshot sont restaurées, pas seulement les quatre de `consentKeys` : staging en a six (`Test`, `test-test` en plus) et
     * « Tout suivre » les active toutes (relevé le 2026-10-15 : un snapshot partiel laissait `Test` et `test-test` à vrai).
     */
    async restoreDemarchesConsents(states: Record<string, boolean>): Promise<void> {
        const current = await this.demarchesConsentStates()
        for (const [key, checked] of Object.entries(states)) {
            if (key in current && current[key] !== checked) await this.setDemarchesConsent(key, checked)
        }
    }

    /** Attend le toast « Attention » affiché en retirant le consentement AMI, et vérifie qu'il annonce la conservation de l'historique. */
    async assertDemarchesConsentWarningDisplayed(): Promise<void> {
        await waitForPageText(preferencesLocators.demarchesConsentWarning)
        await waitForPageText(preferencesLocators.demarchesConsentWarningHistory)
    }

    /** Libellés « Suivre mes démarches {partenaire} sur mon appareil mobile » affichés. */
    async demarchesConsentLabels(): Promise<string[]> {
        await waitForHeading(preferencesLocators.demarchesConsentsTitle)
        const text = await pageText()
        return Array.from(text.matchAll(/Suivre mes démarches (.+?) sur mon appareil mobile/g)).map(m => m[1])
    }

    /** Active ou désactive l'interrupteur GLOBAL des notifications push (page Préférences > Notifications déjà ouverte). */
    async setPushNotifications(enabled: boolean): Promise<void> {
        await this.assertNotificationsDisplayed()
        await setCheckbox(preferencesLocators.pushNotificationsToggleName, enabled)
    }

    /**
     * WEBAPP seulement : attend que le navigateur ait un abonnement Web Push (service worker + pushManager). Faux si le navigateur piloté
     * n'en obtient pas (ex. service de push du navigateur injoignable en automatisation) : le test doit alors le dire, pas échouer à l'aveugle.
     */
    async waitForWebPushSubscription(timeoutMs = 20000): Promise<boolean> {
        try {
            await browser.waitUntil(async () => await browser.execute(() => navigator.serviceWorker.ready
                .then(reg => reg.pushManager.getSubscription())
                .then(sub => sub !== null, () => false)), {timeout: timeoutMs, interval: 500})
            return true
        } catch {
            return false
        }
    }

    /** WEBAPP seulement : titres des notifications SYSTÈME (navigateur) affichées par le service worker. */
    async webSystemNotificationTitles(): Promise<string[]> {
        // execute W3C : la Promise retournée est attendue par le navigateur (executeAsync n'existe plus en WDIO 10).
        return await browser.execute(() => navigator.serviceWorker.ready
            .then(reg => reg.getNotifications())
            .then(list => list.map(n => n.title), () => [] as string[]))
    }

    /** État de l'interrupteur GLOBAL des notifications push (Préférences > Notifications), distinct des consentements aux démarches par partenaire. */
    async pushNotificationsToggleState(): Promise<boolean | undefined> {
        await this.assertNotificationsDisplayed()
        return (await checkboxStates())[preferencesLocators.pushNotificationsToggleName]
    }
}

export default traced(new PreferencesPage(), 'PreferencesPage')
