import {fcDemoSpLocators} from '../locators/franceconnect/franceconnect-demo-sp.locators'
import {traced} from '../../helpers/reporting/traced'
import {clickDisplayed, firstDisplayed, isShown} from '../../helpers/spa/spa'

/** Fournisseur de service de démonstration FranceConnect (carte « Déconnexion FC » du catalogue de staging). */
class FranceConnectDemoSpPage {
    /** Attend la page de connexion du démonstrateur (titre d'onglet et bouton « Connexion à FranceConnect »). */
    async assertLoginDisplayed(): Promise<void> {
        await firstDisplayed(fcDemoSpLocators.loginButton, {timeout: 15000})
        await expect(browser).toHaveTitle(fcDemoSpLocators.loginPageTitle)
    }

    /** Clique « Connexion à FranceConnect » : mène à FranceConnect (consentement si une session FC est ouverte, choix du compte sinon). */
    async connect(): Promise<void> {
        await clickDisplayed(fcDemoSpLocators.loginButton)
    }

    /** FranceConnect propose-t-il directement le consentement (donc une session FC est ouverte) ? */
    async isConsentShown(timeout = 10000): Promise<boolean> {
        return await isShown(fcDemoSpLocators.consentButton, timeout)
    }

    /** Valide le consentement « Continuer sur … » et attend la page de retour du démonstrateur (lien « Se déconnecter »). */
    async consentAndWaitCallback(): Promise<void> {
        await clickDisplayed(fcDemoSpLocators.consentButton)
        await this.assertCallbackDisplayed()
    }

    /** Après les identifiants : le consentement est affiché ; s'il ne l'est pas, la page de retour doit déjà l'être. */
    async consentIfAskedAndWaitCallback(): Promise<void> {
        if (await this.isConsentShown(10000)) await clickDisplayed(fcDemoSpLocators.consentButton)
        await this.assertCallbackDisplayed()
    }

    /** Attend la page de retour du démonstrateur (« Login Callback »). */
    async assertCallbackDisplayed(): Promise<void> {
        await firstDisplayed(fcDemoSpLocators.logoutLink, {timeout: 15000})
    }

    /** Clique « Se déconnecter » : déconnexion de FranceConnect, retour sur la page de connexion du démonstrateur. */
    async logout(): Promise<void> {
        await clickDisplayed(fcDemoSpLocators.logoutLink)
        await this.assertLoginDisplayed()
    }
}

export default traced(new FranceConnectDemoSpPage(), 'FranceConnectDemoSpPage')
