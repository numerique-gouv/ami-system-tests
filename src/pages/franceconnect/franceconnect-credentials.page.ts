import {fcCredentialsLocators} from '../locators/franceconnect/franceconnect-credentials.locators'
import {traced} from '../../helpers/traced'
import {tl} from '../../helpers/webview'
import {platform} from '../../platform'
import type {TestUser} from '../../helpers/test-users'
import logger from "@wdio/logger";

const log = logger('page-object')

class FranceConnectCredentialsPage {
    /**
     * Sonde dédiée credentials — bare, même raison de ne pas ouvrir son propre inWebContext
     * qu'isEidasTileVisibleBare() (franceconnect-eidas.page.ts) / isFranceConnectTextVisible()
     * (franceconnect-mire.page.ts).
     */
    private async isCredentialsPageTextVisibleBare(): Promise<boolean> {
        return await driver.execute(
            (pattern: string) => new RegExp(pattern).test(document.body?.textContent ?? ''),
            fcCredentialsLocators.fcpLowHeadingPattern.source
        ) as boolean
    }

    /**
     * Sonde dédiée publique, réutilisée par authenticate() (détection d'écran).
     */
    async isCredentialsVisible(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() => this.isCredentialsPageTextVisibleBare()).catch(() => false)
    }

    async fillCredentials(user: TestUser) {
        await platform().inWebContext(async () => {
            try {
                // synchrone, survit à une navigation en cours (cf. commentaire selectEidasFaible
                // dans franceconnect-eidas.page.ts).
                await browser.waitUntil(
                    () => this.isCredentialsPageTextVisibleBare(),
                    {
                        timeout: 10000,
                        interval: 300,
                        timeoutMsg: `Page FCP-LOW non chargée — texte "${fcCredentialsLocators.fcpLowHeadingText}" absent après 10s`
                    }
                )
                const idField = await tl().getByLabelText(/identifiant/i)
                await idField.scrollIntoView()
                await idField.clearValue()
                await idField.setValue(user.login)
                const pwdField = await tl().getByLabelText(/mot de passe/i)
                await pwdField.scrollIntoView()
                await pwdField.clearValue()
                await pwdField.setValue(user.password)
                // pas de fallback driver.execute nécessaire ici (cf. franceconnect-credentials.locators.ts).
                const submitBtn = await tl().getByRole('button', {name: /valider/i})
                await submitBtn.click()
                //await submitBtn.waitForDisplayed({timeout: 15000, reverse: true})
                await submitBtn.click()
            } catch {
                // Best-effort : la session FC peut déjà être ouverte (cf. franceconnect-eidas.page.ts
                // selectEidasFaible). Loggé quand même — une vraie erreur d'interaction (champ/bouton
                // introuvable) sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                log.warn('fillCredentials: échec sur la page credentials')
            }
        })
    }
}

export default traced(new FranceConnectCredentialsPage(), 'FranceConnectCredentialsPage')
