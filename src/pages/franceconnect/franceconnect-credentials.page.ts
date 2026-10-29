import {fcCredentialsLocators} from '../locators/franceconnect/franceconnect-credentials.locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import type {TestUser} from '../../helpers/common/test-users'
import logger from "@wdio/logger";
import {clickDisplayed, firstDisplayed} from '../../helpers/spa/spa'
import {iosCredentialsFieldsNativeAx} from '../locators/franceconnect/franceconnect-credentials.locators'
import {waitForNativeAx} from '../../helpers/mobile/native-ax'

const log = logger('page-object')

class FranceConnectCredentialsPage {
    async fillCredentials(user: TestUser): Promise<void> {
        await platform().inWebContext(async () => {
            try {
                // firstDisplayed attend le rendu du formulaire (10 s par défaut).
                const idField = await firstDisplayed(fcCredentialsLocators.identifierField)
                await idField.clearValue()
                await idField.setValue(user.login)
                const pwdField = await firstDisplayed(fcCredentialsLocators.passwordField)
                await pwdField.clearValue()
                await pwdField.setValue(user.password)
                await clickDisplayed(fcCredentialsLocators.submitButton)
            } catch (err) {
                // Best-effort : la session FC peut déjà être ouverte (cf. franceconnect-eidas.page.ts
                // selectEidasFaible). Loggé quand même — une vraie erreur d'interaction (champ/bouton
                // introuvable) sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                log.warn('fillCredentials: échec sur la page credentials', err)
            }
        })
        // La validation redirige vers l'app (autre document, plusieurs changements de target) : on constate la disparition du formulaire
        // avant toute commande suivante. Sans effet si le formulaire n'a pas été rempli (session FC ouverte : rien à attendre).
        await waitForNativeAx(iosCredentialsFieldsNativeAx, 'gone')
    }
}

export default traced(new FranceConnectCredentialsPage(), 'FranceConnectCredentialsPage')
