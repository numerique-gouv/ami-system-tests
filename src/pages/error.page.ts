import {traced} from '../helpers/reporting/traced'
import {waitForHeading} from '../helpers/spa/spa'
import NavigationPage from './navigation.page'

/** Pages d'erreur de la SPA (`/network-error`, `/technical-error`, `/forbidden`). */
class ErrorPage {
    async openRoute(route: string): Promise<void> {
        await NavigationPage.goToRoute(route)
    }

    async assertDisplayed(title: string): Promise<void> {
        await waitForHeading(title)
    }
}

export default traced(new ErrorPage(), 'ErrorPage')
