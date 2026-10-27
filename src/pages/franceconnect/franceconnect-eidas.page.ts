import {fcEidasLocators, iosEidasLinkNativeAx, iosEidasOrNotificationSheetNativeAx} from '../locators/franceconnect/franceconnect-eidas.locators'
import {AssertionError} from 'node:assert'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {clickDisplayed, isShown} from '../../helpers/spa/spa'
import {waitForNativeAx} from '../../helpers/mobile/native-ax'

class FranceConnectEidasPage {
    /**
     * Sonde dédiée, réutilisée par la boucle de connexion (authenticate.process.ts) : la mire eIDAS est-elle affichée ?
     */
    async isEidasVisible(timeout = 0): Promise<boolean> {
        return await isShown(fcEidasLocators.eidasFaibleLink, timeout)
    }

    /**
     * Attend que la mire eIDAS soit affichée. `false` si elle ne vient pas : FranceConnect a pu
     * authentifier directement (session SSO déjà ouverte), sans demander eIDAS ni identifiants.
     */
    async waitForEidasTile(timeout = 15000): Promise<boolean> {
        // iOS : constaté par l'arbre natif (présent ~1 s après le clic FranceConnect). Session SSO ouverte : 15 s d'attente pour rien dans la WebView.
        if (driver.isIOS) return await this.waitForNativeEidas(timeout)
        return await this.isEidasVisible(timeout)
    }

    /** iOS : la page eIDAS (vrai) ou, à sa place, la feuille de notifications d'une session déjà ouverte (faux, tout de suite) ; faux aussi au délai. */
    private async waitForNativeEidas(timeout: number): Promise<boolean> {
        // Hors iOS (Android, webapp) : pas d'arbre natif XCUITest (`-ios predicate string` y est refusé) ni de course de targets WebKit :
        // rien à constater ici, la page eIDAS est attendue par le clic dans la WebView.
        if (!driver.isIOS) return true
        await waitForNativeAx(iosEidasOrNotificationSheetNativeAx, 'present', 'Page eIDAS ou feuille de notifications', Math.min(timeout, 6000))
        return (await $$(iosEidasLinkNativeAx)).length > 0
    }

    async selectEidasFaible(): Promise<void> {
        // iOS : la page eIDAS est attendue par l'arbre natif (la page FranceConnect précédente est en cours de remplacement : aucune commande WebView avant).
        // Absente : FranceConnect a authentifié directement (session SSO ouverte) — on échoue tout de suite (la boucle de connexion ré-observe)
        // au lieu d'attendre 10 s de plus le lien dans la WebView.
        if (!await this.waitForNativeEidas(5000)) {
            throw new AssertionError({message: 'page eIDAS absente (session FranceConnect déjà ouverte ?)'})
        }
        await platform().inWebContext(async () => {
            // Écran atteint juste après le redirect OIDC login → eIDAS — no-op sur Android,
            // cf. commentaire de refreshAxTree() dans appium.adapter.ts.
            await platform().refreshAxTree()
            await clickDisplayed(fcEidasLocators.eidasFaibleLink, {timeout: 10000})
        })
        // Le clic mène à la page d'identifiants (autre document) : on constate la disparition de la page eIDAS avant toute commande suivante.
        await waitForNativeAx(iosEidasLinkNativeAx, 'gone', 'Lien eIDAS faible')
    }
}

export default traced(new FranceConnectEidasPage(), 'FranceConnectEidasPage')
