import {getLoginLocators} from './locators/login.locators'
import {traced} from '../helpers/traced'
import {tl, withWebView} from '../helpers/webview'
import {setBackendUrl} from '../helpers/notifications-api'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

class LoginPage {
    /**
     * Sélectionne l'environnement dans le review-picker staging si visible (no-op sinon).
     * Le picker apparaît uniquement sur les builds staging avec plusieurs review apps.
     *
     * Étape 1 — détecte si l'écran picker est affiché : attend l'item "Staging" (toujours
     * en tête de liste). Si absent après 15 s → build sans picker, retour silencieux.
     *
     * Étape 2 — scroll jusqu'à l'item AMI_ENV et cliquer. Si l'item cible est introuvable
     * malgré le scroll, l'erreur se propage (configuration AMI_ENV incorrecte).
     */
    async reviewEnvironmentPicker(): Promise<void> {
        const loc = getLoginLocators()

        // "Staging" est toujours le premier item — sa présence confirme que le picker est affiché.
        try {
            await $(loc.pickerSentinel).waitForDisplayed({timeout: 10000})
        } catch {
            return // Écran picker absent — build sans picker, no-op
        }

        const picker = $(loc.environmentPicker)
        await this.scrollToPickerTile(picker)
        //await picker.waitForDisplayed({timeout: 5000})
        const title = await picker.getText()
        setBackendUrl(reviewTitleToApiUrl(title))
        await picker.click()
        //await picker.waitForDisplayed({timeout: 1000, reverse: true})
    }

    /**
     * Tape le bouton "S'identifier avec FranceConnect".
     * Sur Android : bouton natif (NATIVE_APP, contentDescription).
     * Sur iOS : bouton dans la WebView SPA (context switch automatique).
     * Cet écran peut apparaitre une 2e fois (sur iOS) à cause d'une concurrence dans la gestion d'OIDC.
     */
    async tapFranceConnect(oidcConcurrencyBugOnIOs = false): Promise<void> {
        // Retry court en Page Object (5s) : distingue le cas attendu (2e apparition du bouton,
        // best-effort) du cas normal (15s, absence signale un vrai bug de sélecteur). Le catch
        // reste loggé même en best-effort — un catch {} vide masquerait un sélecteur cassé.
        const timeout = oidcConcurrencyBugOnIOs ? 5000 : 15000

        if (driver.isIOS) {
            await withWebView(async () => {
                try {
                    await browser.waitUntil(
                        () => driver.execute(
                            (t: string) => document.body.innerText.includes(t),
                            'FranceConnect'
                        ) as Promise<boolean>,
                        {timeout, interval: 300}
                    )
                    const fcButton = await tl().findByRole('button', {name: /identifier avec franceconnect/i}, {timeout})
                    await fcButton.click()
                } catch {
                    let message = "bouton de connexion avec FranceConnect introuvable";
                    if (oidcConcurrencyBugOnIOs) {
                            // it is never found on Android
                            // when this message stops appearing with iOS,
                            // than the second call to tapFranceConnect will have become useless.
                            log.info(message)
                    } else {
                        throw new AssertionError({message: message})
                    }
                }
            })
        } else {
            // Bouton natif Android (contentDescription "franceConnect button") : pas de WebView
            // à ce stade de l'écran de login, donc pas de withWebView() ici (cf. androidLoginLocators
            // .fcButtonInWebView = false). Même distinction best-effort / erreur réelle que iOS.
            const loc = getLoginLocators()
            try {
                await $(loc.fcButton).waitForDisplayed({timeout: timeout, interval: 300, timeoutMsg: "bouton de connexion avec FranceConnect introuvable" })
                log.info('btn FC trouvé !!!')
                await $(loc.fcButton).click()
            } catch {
                const message = "bouton de connexion avec FranceConnect introuvable"
                if (oidcConcurrencyBugOnIOs) {
                    log.info(message)
                } else {
                    log.info('Arrfffff')
                    throw new AssertionError({message})
                }
            }
        }
    }

    /**
     * Swipe vers le bas (doigt monte) jusqu'à ce que la tile du picker soit visible.
     * Gère les listes longues (LazyColumn Android, ScrollView iOS) où les items
     * hors viewport ne sont pas encore rendus dans l'arbre d'accessibilité.
     */
    async scrollToPickerTile(selector: ChainablePromiseElement): Promise<void> {
        const {width, height} = await driver.getWindowSize()
        await browser.waitUntil(
            async () => {
                try {
                    if (await selector.isDisplayed()) return true
                } catch { /* tile hors du viewport ou liste encore en chargement */
                }
                await driver.action('pointer', {parameters: {pointerType: 'touch'}})
                    .move({duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.7)})
                    .down({button: 0})
                    .move({duration: 600, x: Math.round(width / 2), y: Math.round(height * 0.3)})
                    .up({button: 0})
                    .perform()
                return false
            },
            {timeout: 30000, interval: 200, timeoutMsg: 'Tile du picker introuvable après scroll'}
        )
    }

}

/**
 * Dérive l'URL backend depuis le titre d'un item du review-picker.
 * Format titre : "Staging" → URL staging, "PR{n}: ..." → URL review app PR.
 */
function reviewTitleToApiUrl(title: string): string {
    const prMatch = title.match(/^PR(\d+):/i)
    if (prMatch) {
        return `https://ami-back-staging-pr${prMatch[1]}.osc-fr1.scalingo.io`
    }
    return 'https://ami-back-staging.osc-fr1.scalingo.io'
}

export default traced(new LoginPage(), 'LoginPage')
