import {fcEidasLocators, iosEidasLinkNativeAx} from '../locators/franceconnect/franceconnect-eidas.locators'
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
        if (driver.isIOS) return await waitForNativeAx(iosEidasLinkNativeAx, 'present', 'Page eIDAS', Math.min(timeout, 6000))
        return await this.isEidasVisible(timeout)
    }

    async selectEidasFaible(): Promise<void> {
        // iOS : la page eIDAS est attendue par l'arbre natif (la page FranceConnect précédente est en cours de remplacement : aucune commande WebView avant).
        // Absente : FranceConnect a authentifié directement (session SSO ouverte) — on échoue tout de suite (la boucle de connexion ré-observe)
        // au lieu d'attendre 10 s de plus le lien dans la WebView.
        if (!await waitForNativeAx(iosEidasLinkNativeAx, 'present', 'Page eIDAS', 5000)) {
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
