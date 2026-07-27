import {fcpLocators} from './locators/franceconnect.locators'
import {traced} from '../helpers/traced'
import {tl, withWebView} from '../helpers/webview'
import type {TestUser} from '../helpers/test-users'
import logger from "@wdio/logger";
import HomePage from "@pages/home.page";

const log = logger('page-object')



class FranceConnectPage {
     async selectEidasFaible() : Promise<boolean>  {
        return await withWebView(async () => {
            // queries Testing Library (executeAsync).
            const tileTimeoutMs = 5000
            const labelLower = fcpLocators.eidasFaibleLabel.toLowerCase()
            let eIDASSelectionDisplayed = await browser.waitUntil(
                async () => driver.execute(
                    (label: string) => Array.from(document.querySelectorAll('button, a'))
                        .some(el => el.textContent?.toLowerCase().includes(label)),
                    labelLower
                ) as Promise<boolean>,
                {
                    timeout: tileTimeoutMs,
                    interval: 300,
                    timeoutMsg: `Tuile "${fcpLocators.eidasFaibleLabel}" non visible après ${tileTimeoutMs}ms`
                }
            ).catch(() => {
                    log.warn("Pas de sélection d'eiDAS faible affichée, session FC déjà ouverte")
                    return false
                }
            );
            if (eIDASSelectionDisplayed) {
                //await refreshAxTree()
                const eidasLink = await tl().getByRole('link', {name: new RegExp(fcpLocators.eidasFaibleLabel, 'i')})
                await eidasLink.click()
                return false;
            } else {
                return HomePage.isHomeVisible()
            }
        })
    }

    async fillCredentials(user: TestUser) {
        await withWebView(async () => {
            try {
                // synchrone, survit à une navigation en cours (cf. commentaire selectEidasFaible ci-dessus).
                await browser.waitUntil(
                    async () => driver.execute(
                        (text: string) => document.body?.textContent?.includes(text) ?? false,
                        fcpLocators.fcpLowHeadingText
                    ) as Promise<boolean>,
                    {
                        timeout: 10000,
                        interval: 300,
                        timeoutMsg: `Page FCP-LOW non chargée — texte "${fcpLocators.fcpLowHeadingText}" absent après 10s`
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
                // pas de fallback driver.execute nécessaire ici (cf. franceconnect.locators.ts).
                const submitBtn = await tl().getByRole('button', {name: /valider/i})
                await submitBtn.click()
                //await submitBtn.waitForDisplayed({timeout: 15000, reverse: true})
                await submitBtn.click()
            } catch {
                // Best-effort : la session FC peut déjà être ouverte (cf. selectEidasFaible).
                // Loggé quand même — une vraie erreur d'interaction (champ/bouton introuvable)
                // sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                log.warn('loginWithSandbox: échec sur la page credentials')
            }
        })
    }
}

export default traced(new FranceConnectPage(), 'FranceConnectPage')
