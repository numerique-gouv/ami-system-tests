import {fcEidasLocators, iosEidasLinkNativeAx, iosEidasOrNotificationSheetNativeAx} from '../locators/franceconnect/franceconnect-eidas.locators'
import {AssertionError} from 'node:assert'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {clickDisplayed, isShown} from '../../helpers/spa/spa'
import {waitForNativeAx} from '../../helpers/mobile/native-ax'

class FranceConnectEidasPage {
    /** `false` si la mire eIDAS ne vient pas : FranceConnect a pu authentifier directement (session SSO déjà ouverte). */
    async waitForEidasTile(timeout = 15000): Promise<boolean> {
        if (driver.isIOS) return await this.waitForNativeEidas(timeout)
        return await isShown(fcEidasLocators.eidasFaibleLink, timeout)
    }

    /** iOS : la page eIDAS (vrai) ou, à sa place, la feuille de notifications d'une session déjà ouverte (faux, tout de suite) ; faux aussi au délai. Hors iOS : vrai. */
    private async waitForNativeEidas(timeout: number): Promise<boolean> {
        if (!driver.isIOS) return true
        await waitForNativeAx(iosEidasOrNotificationSheetNativeAx, 'present', Math.min(timeout, 6000))
        return (await $$(iosEidasLinkNativeAx)).length > 0
    }

    async selectEidasFaible(): Promise<void> {
        // iOS : la page eIDAS est attendue par l'arbre natif, aucune commande WebView avant que la page précédente soit remplacée.
        if (!await this.waitForNativeEidas(5000)) {
            throw new AssertionError({message: 'page eIDAS absente (session FranceConnect déjà ouverte ?)'})
        }
        await platform().inWebContext(async () => {
            await platform().refreshAxTree()
            await clickDisplayed(fcEidasLocators.eidasFaibleLink, {timeout: 10000})
        })
        await waitForNativeAx(iosEidasLinkNativeAx, 'gone')
    }
}

export default traced(new FranceConnectEidasPage(), 'FranceConnectEidasPage')
