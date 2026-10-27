import {fcEidasLocators} from '../locators/franceconnect/franceconnect-eidas.locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {clickDisplayed, isShown} from '../../helpers/spa'

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
        return await this.isEidasVisible(timeout)
    }

    async selectEidasFaible(): Promise<void> {
        await platform().inWebContext(async () => {
            // Écran atteint juste après le redirect OIDC login → eIDAS — no-op sur Android,
            // cf. commentaire de refreshAxTree() dans appium.adapter.ts.
            await platform().refreshAxTree()
            await clickDisplayed(fcEidasLocators.eidasFaibleLink, {timeout: 10000})
        })
    }
}

export default traced(new FranceConnectEidasPage(), 'FranceConnectEidasPage')
