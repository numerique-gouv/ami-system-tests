import {waitForNativeAx} from '../../helpers/mobile/native-ax'
import {franceConnectMireLocators, iosFcButtonNativeAx} from '../locators/franceconnect/franceconnect-mire.locators'
import {hasNativeLocators} from '../../helpers/common/pick-locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {AssertionError} from "node:assert";
import {allDisplayed, isShown} from '../../helpers/spa/spa'
import {homeContentLocators} from '../locators/home.locators'

// Page d'erreur technique du fournisseur d'identité de démonstration FCP-LOW (ex. « code : Y000000 », « id: 887ae5c4-… »).
const FC_ERROR_CODE_PATTERN = /code\s*:\s*(\S+)/i
const FC_ERROR_ID_PATTERN = /id\s*:\s*(\S+)/i

/** Page d'erreur de FCP-LOW, hors de l'app AMI : `tapFranceConnect` revient en arrière en natif avant de remonter l'échec, puis la boucle de authenticate.process.ts reprend depuis l'écran de connexion. */
export class FranceConnectProviderError extends Error {
    constructor(readonly code: string, readonly providerId: string | undefined, url: string) {
        super(`Le fournisseur d'identité de démonstration FranceConnect renvoie une page d'erreur (code: ${code}, id: ${providerId ?? '?'}, url="${url}")`)
    }
}

class FranceConnectMirePage {
    hasNativeLoginButton(): boolean {
        return hasNativeLocators(franceConnectMireLocators)
    }

    private async isNativeFcButtonDisplayed(): Promise<boolean> {
        return await $(franceConnectMireLocators.android!.button).isDisplayed()
    }

    async isLoginScreenVisible(): Promise<boolean> {
        if (hasNativeLocators(franceConnectMireLocators)) {
            return await this.isNativeFcButtonDisplayed()
        }
        // iOS : lecture native, jamais bloquée par un `execute` sans réponse pendant que la WebView change de domaine.
        if (driver.isIOS) {
            return await $$(iosFcButtonNativeAx).length > 0
        }
        return await isShown(franceConnectMireLocators.web!.anyButton)
    }

    /** Après un logout, la SPA met quelques secondes à rediriger vers `/#/login`. */
    async waitForLoginScreen(timeout = 20000): Promise<void> {
        await browser.waitUntil(() => this.isLoginScreenVisible(), {
            timeout, interval: 500, timeoutMsg: `Écran de connexion FranceConnect non affiché après ${timeout}ms`,
        })
    }

    /** À appeler depuis un inWebContext ouvert. Distingue la page d'erreur FCP-LOW du formulaire de connexion, qui partage son bandeau. */
    async detectProviderErrorBare(): Promise<FranceConnectProviderError | null> {
        const bodyText = await driver.execute(() => document.body.innerText).catch(() => '') as string
        const errorCode = bodyText.match(FC_ERROR_CODE_PATTERN)?.[1]
        if (!errorCode) return null
        const providerId = bodyText.match(FC_ERROR_ID_PATTERN)?.[1]
        const url = await browser.getUrl().catch(() => '?')
        return new FranceConnectProviderError(errorCode, providerId, url)
    }

    /**
     * Tape « S'identifier avec FranceConnect ». Android : bouton natif d'abord, puis, comme iOS et la webapp, celui de la SPA (affiché
     * aussi quand le natif est absent, par exemple à la reconnexion après un logout). Sur iOS le bouton peut apparaître une 2e fois.
     */
    async tapFranceConnect(isOkToFail = false): Promise<void> {
        const timeout = isOkToFail ? 5000 : 15000

        if (hasNativeLocators(franceConnectMireLocators)) {
            let tapped = false
            await browser.waitUntil(
                async () => {
                    const displayed = await this.isNativeFcButtonDisplayed()
                    if (displayed) {
                        tapped = true
                        await $(franceConnectMireLocators.android!.button).click()
                    }
                    return displayed
                },
                {timeout: 3000, interval: 500}
            ).catch(() => undefined)
            if (tapped) {
                // La cible est un seul tap ; la page de login de la SPA peut demander un 2e tap, facultatif, pour que le test continue.
                const onSpaLogin = await this.tapFranceConnectInWebView(true, 8000).catch(() => false)
                if (!onSpaLogin && await this.reloadSpaRootIfLoggedOut()) {
                    await this.tapFranceConnectInWebView(true, 15000).catch(() => undefined)
                }
                return
            }
        }

        await this.tapFranceConnectInWebView(isOkToFail, timeout)
    }

    /** `true` si le bouton rendu par la SPA a été tapé ; en mode `isOkToFail`, son absence n'est pas une erreur. */
    private async tapFranceConnectInWebView(isOkToFail: boolean, timeout: number): Promise<boolean> {
        let tapped = false
        await platform().inWebContext(async () => {
            try {
                await (await this.waitForButtonOrHome(timeout)).click()
                tapped = true
            } catch {
                // Erreur typée : l'appelant, de retour en NATIVE_APP, doit faire un retour natif avant de remonter l'échec.
                const providerError = await this.detectProviderErrorBare()
                if (providerError) throw providerError
                if (!isOkToFail) throw new AssertionError({message: 'bouton de connexion avec FranceConnect introuvable'})
            }
        }).catch(async (err: unknown) => {
            if (!(err instanceof FranceConnectProviderError)) throw err
            // inWebContext a remis NATIVE_APP : le back() agit sur le geste natif, pour quitter le navigateur intégré.
            await driver.back().catch(() => undefined)
            throw new AssertionError({message: err.message})
        })
        // iOS : le clic mène à FranceConnect (autre document) ; constater la disparition du bouton par l'arbre natif avant toute commande suivante.
        if (tapped && driver.isIOS) await waitForNativeAx(iosFcButtonNativeAx, 'gone')
        return tapped
    }

    /** Session encore ouverte : l'app va directement à l'accueil, sans bouton à attendre. Lance dans ce cas, tout de suite. */
    private async waitForButtonOrHome(timeout: number): Promise<WebdriverIO.Element> {
        let button: WebdriverIO.Element | undefined
        let home = false
        await browser.waitUntil(async () => {
            button = (await allDisplayed(franceConnectMireLocators.web!.button))[0]
            if (button) return true
            home = (await allDisplayed(homeContentLocators.greeting)).length > 0
            return home
        }, {timeout, interval: 200, timeoutMsg: `Aucun bouton FranceConnect affiché après ${timeout}ms`})
        if (!button) throw new AssertionError({message: 'accueil déjà affiché (session ouverte) : pas de bouton FranceConnect à taper'})
        return button
    }

    /** Après une déconnexion la WebView reste sur `/?is_logged_out#/` : seul un chargement complet de la racine redirige vers `#/login`. `true` si la racine a été rechargée. */
    private async reloadSpaRootIfLoggedOut(): Promise<boolean> {
        return await platform().inWebContext(async () => {
            const href = await driver.execute(() => location.href) as string
            if (!/is_logged_out/.test(href)) return false
            await browser.url(new URL('/', href).href)
            return true
        }).catch(() => false)
    }
}

export default traced(new FranceConnectMirePage(), 'FranceConnectMirePage')
