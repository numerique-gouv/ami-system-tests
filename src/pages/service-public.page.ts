import {servicePublicLocators} from './locators/service-public.locators'
import {traced} from '../helpers/reporting/traced'
import {firstDisplayed} from '../helpers/spa/spa'

/** Où la navigation a abouti : jamais l'adresse complète, le jeton `caller` d'AMI y figure. */
export interface Landing {
    host: string
    path: string
    title: string
}

/** Pages externes de Service Public atteintes depuis AMI : on observe la page finale d'une redirection. */
class ServicePublicPage {
    /** Connexion silencieuse : le formulaire OTV affiche l'identité fournie par FranceConnect. */
    async assertIdentityProvidedByFranceConnect(): Promise<void> {
        await firstDisplayed(servicePublicLocators.otvHeading, {timeout: 20000})
        await firstDisplayed(servicePublicLocators.identityProvidedByFranceConnect, {timeout: 20000})
    }

    /** Connexion non silencieuse : la page de connexion propose FranceConnect. */
    async assertLoginWithFranceConnectOffered(): Promise<void> {
        await firstDisplayed(servicePublicLocators.loginWithFranceConnectLink, {timeout: 20000})
    }

    /** Ouvre le formulaire OTV sans le jeton d'AMI et décrit la page atteinte après redirections. */
    async openOtvWithoutAmiToken(): Promise<Landing> {
        await browser.url(servicePublicLocators.otvDirectUrl)
        const url = new URL(await browser.getUrl())
        return {host: url.host, path: url.pathname, title: await browser.getTitle()}
    }
}

export default traced(new ServicePublicPage(), 'ServicePublicPage')
