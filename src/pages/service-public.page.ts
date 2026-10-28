import {servicePublicLocators} from './locators/service-public.locators'
import {traced} from '../helpers/reporting/traced'
import {firstDisplayed} from '../helpers/spa/spa'

/** Où la navigation a abouti : hôte, chemin et titre. Jamais l'adresse complète (le jeton `caller` d'AMI y figure). */
export interface Landing {
    host: string
    path: string
    title: string
}

/**
 * Page Object des pages EXTERNES de Service Public atteintes depuis AMI (formulaire OTV, page de connexion). Aucune SPA AMI ici : on
 * observe la page FINALE d'une redirection, pas les redirections intermédiaires.
 */
class ServicePublicPage {
    /** Le formulaire OTV affiche l'identité fournie par FranceConnect : l'usager n'a pas eu à se connecter (connexion silencieuse). */
    async assertIdentityProvidedByFranceConnect(): Promise<void> {
        await firstDisplayed(servicePublicLocators.otvHeading, {timeout: 20000})
        await firstDisplayed(servicePublicLocators.identityProvidedByFranceConnect, {timeout: 20000})
    }

    /** La page de connexion de Service Public propose de s'identifier avec FranceConnect (connexion NON silencieuse). */
    async assertLoginWithFranceConnectOffered(): Promise<void> {
        await firstDisplayed(servicePublicLocators.loginWithFranceConnectLink, {timeout: 20000})
    }

    /** Ouvre le formulaire OTV sans le jeton d'AMI (redirections suivies) et décrit la page atteinte. */
    async openOtvWithoutAmiToken(): Promise<Landing> {
        await browser.url(servicePublicLocators.otvDirectUrl)
        const url = new URL(await browser.getUrl())
        return {host: url.host, path: url.pathname, title: await browser.getTitle()}
    }
}

export default traced(new ServicePublicPage(), 'ServicePublicPage')
