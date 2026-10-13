import {traced} from '../../helpers/traced'
import {platform} from '../../platform'
import type {TestUser} from '../../helpers/test-users'
import logger from "@wdio/logger";
import {findLabel, findRole} from '../../helpers/spa'

const log = logger('page-object')

class FranceConnectCredentialsPage {
    async fillCredentials(user: TestUser): Promise<void> {
        await platform().inWebContext(async () => {
            try {
                // findLabel attend le rendu du formulaire (10 s par défaut).
                const idField = await findLabel(/identifiant/i)
                await idField.clearValue()
                await idField.setValue(user.login)
                const pwdField = await findLabel(/mot de passe/i)
                await pwdField.clearValue()
                await pwdField.setValue(user.password)
                // pas de fallback driver.execute nécessaire ici (cf. franceconnect-credentials.locators.ts).
                const submitBtn = await findRole('button', /valider/i)
                await submitBtn.click()
            } catch (err) {
                // Best-effort : la session FC peut déjà être ouverte (cf. franceconnect-eidas.page.ts
                // selectEidasFaible). Loggé quand même — une vraie erreur d'interaction (champ/bouton
                // introuvable) sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                log.warn('fillCredentials: échec sur la page credentials', err)
            }
        })
    }
}

export default traced(new FranceConnectCredentialsPage(), 'FranceConnectCredentialsPage')
