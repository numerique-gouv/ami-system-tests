import {fcEidasLocators} from '../locators/franceconnect/franceconnect-eidas.locators'
import {traced} from '../../helpers/traced'
import {platform} from '../../platform'
import {findRole, hasRole} from '../../helpers/spa'

const eidasFaibleName = new RegExp(fcEidasLocators.eidasFaibleLabel, 'i')

class FranceConnectEidasPage {
    /**
     * Sonde dédiée, réutilisée par la boucle de connexion (authenticate.process.ts) : la mire eIDAS est-elle affichée ?
     */
    async isEidasVisible(timeout = 0): Promise<boolean> {
        return await hasRole('link', eidasFaibleName, timeout)
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
            const eidasLink = await findRole('link', eidasFaibleName, {timeout: 10000})
            await eidasLink.click()
        })
    }
}

export default traced(new FranceConnectEidasPage(), 'FranceConnectEidasPage')
