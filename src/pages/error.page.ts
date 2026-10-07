import {traced} from '../helpers/traced'
import {waitForHeading} from '../helpers/spa'
import NavigationPage from './navigation.page'

/** Pages d'erreur de la SPA (`/network-error`, `/technical-error`, `/forbidden`), ouvertes par leur route. */
class ErrorPage {
    async openRoute(route: string): Promise<void> {
        await NavigationPage.goToRoute(route)
    }

    /** Vérifie l'arrivée sur la page d'erreur. Le titre dépend de l'erreur : il est passé en argument. */
    async assertDisplayed(title: string): Promise<void> {
        await waitForHeading(title)
    }
}

export default traced(new ErrorPage(), 'ErrorPage')
