import {fcCredentialsLocators} from '../locators/franceconnect/franceconnect-credentials.locators'
import {traced} from '../../helpers/traced'
import {platform} from '../../platform'
import type {TestUser} from '../../helpers/test-users'
import logger from "@wdio/logger";
import {clickDisplayed, firstDisplayed} from '../../helpers/spa'

const log = logger('page-object')

const isAscii = (value: string): boolean => /^[\x00-\x7F]*$/.test(value)

/** Saisie d'un login non ASCII impossible ou altérée par l'outil de test (et non échec applicatif). */
export class NonAsciiLoginInputError extends Error {}

function nonAsciiHelp(login: string, detail: string): NonAsciiLoginInputError {
    return new NonAsciiLoginInputError(
        `Saisie du login « ${login} » en échec (${detail}). Ce login contient des caractères non ASCII (accents, œ, æ…) : ` +
        `l'outil de test (WDIO setValue / Appium sendKeys, selon la plateforme) peut ne pas savoir les envoyer. ` +
        `À essayer à la main avec les dev tools de WDIO : \`just explore-webapp|android|ios\`, puis \`just s <cible> …\` ou \`wdio session\`.`)
}

class FranceConnectCredentialsPage {
    async fillCredentials(user: TestUser): Promise<void> {
        await platform().inWebContext(async () => {
            try {
                // firstDisplayed attend le rendu du formulaire (10 s par défaut).
                const idField = await firstDisplayed(fcCredentialsLocators.identifierField)
                await idField.clearValue()
                if (isAscii(user.login)) {
                    await idField.setValue(user.login)
                } else {
                    try {
                        await idField.setValue(user.login)
                    } catch (err) {
                        throw nonAsciiHelp(user.login, `setValue a échoué : ${err instanceof Error ? err.message : String(err)}`)
                    }
                    const typed = await idField.getValue()
                    if (typed !== user.login) throw nonAsciiHelp(user.login, `valeur relue « ${typed} » différente de la valeur attendue`)
                }
                const pwdField = await firstDisplayed(fcCredentialsLocators.passwordField)
                await pwdField.clearValue()
                await pwdField.setValue(user.password)
                await clickDisplayed(fcCredentialsLocators.submitButton)
            } catch (err) {
                if (err instanceof NonAsciiLoginInputError) throw err
                // Best-effort : la session FC peut déjà être ouverte (cf. franceconnect-eidas.page.ts
                // selectEidasFaible). Loggé quand même — une vraie erreur d'interaction (champ/bouton
                // introuvable) sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                log.warn('fillCredentials: échec sur la page credentials', err)
            }
        })
    }
}

export default traced(new FranceConnectCredentialsPage(), 'FranceConnectCredentialsPage')
