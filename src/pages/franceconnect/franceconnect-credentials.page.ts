import {fcCredentialsLocators, iosCredentialsFieldsNativeAx} from '../locators/franceconnect/franceconnect-credentials.locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import type {TestUser} from '../../helpers/common/test-users'
import {clickDisplayed, firstDisplayed} from '../../helpers/spa/spa'
import {waitForNativeAx} from '../../helpers/mobile/native-ax'

class FranceConnectCredentialsPage {
    async fillCredentials(user: TestUser): Promise<void> {
        await platform().inWebContext(async () => {
            try {
                const idField = await firstDisplayed(fcCredentialsLocators.identifierField)
                await idField.clearValue()
                await idField.setValue(user.login)
                const pwdField = await firstDisplayed(fcCredentialsLocators.passwordField)
                await pwdField.clearValue()
                await pwdField.setValue(user.password)
                await clickDisplayed(fcCredentialsLocators.submitButton)
            } catch {
                // La session FranceConnect peut déjà être ouverte : pas de formulaire, la boucle de connexion ré-observe l'écran.
            }
        })
        // Sans effet si le formulaire n'a pas été rempli.
        await waitForNativeAx(iosCredentialsFieldsNativeAx, 'gone')
    }
}

export default traced(new FranceConnectCredentialsPage(), 'FranceConnectCredentialsPage')
