import {getFranceConnectMireLocators} from '../locators/franceconnect/franceconnect-mire.locators'
import {traced} from '../../helpers/traced'
import {tl} from '../../helpers/webview'
import {platform} from '../../platform'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

class FranceConnectMirePage {
    /**
     * Sonde dédiée natif — bare (pas de inWebContext, il n'y en a pas besoin côté natif) :
     * réutilisée par authenticate() et par tapFranceConnect() elle-même.
     */
    private async isNativeFcButtonDisplayed(): Promise<boolean> {
        const loc = getFranceConnectMireLocators()
        return await $(loc.fcButton).isDisplayed().catch(() => false)
    }

    /**
     * Sonde dédiée web — bare (à appeler depuis un inWebContext déjà ouvert, jamais son
     * propre inWebContext : tapFranceConnect() a déjà le sien pour toute la méthode, un appel
     * imbriqué re-switcherait vers NATIVE_APP dans son `finally` et casserait le reste du
     * bloc). isLoginScreenVisible() ci-dessous ouvre le contexte pour les appelants externes.
     *
     * Scoping à un <button> (pas tout document.body.innerText) : vérifié en direct sur
     * staging, la mire eIDAS FranceConnect elle-même contient le mot "FranceConnect" (lien de
     * pied de page "En savoir plus sur FranceConnect") — un simple innerText.includes()
     * matcherait donc aussi sur l'écran suivant. Le bouton "S'identifier avec FranceConnect"
     * est un <button>, ce lien de pied de page un <a> : restreindre à button lève l'ambiguïté.
     */
    private async isFranceConnectTextVisible(): Promise<boolean> {
        return await driver.execute(
            (t: string) => Array.from(document.querySelectorAll('button'))
                .some(b => b.textContent?.toLowerCase().includes(t.toLowerCase())),
            'FranceConnect'
        ) as boolean
    }

    /**
     * Sonde dédiée publique, réutilisée par authenticate() (détection d'écran) — dispatch
     * natif/web identique à celui de tapFranceConnect().
     */
    async isLoginScreenVisible(): Promise<boolean> {
        if (platform().fcButtonIsNative) {
            return await this.isNativeFcButtonDisplayed()
        }
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() => this.isFranceConnectTextVisible()).catch(() => false)
    }
    /**
     * Tape le bouton "S'identifier avec FranceConnect".
     * Sur iOS et en webapp, le bouton est toujours dans le DOM de la SPA. Sur Android, il est
     * normalement natif (NATIVE_APP, contentDescription) mais peut aussi être rendu par la SPA —
     * observé lors d'une reconnexion après logout (logs Appium du 2026-08-08 23:24 :
     * `~franceConnect button` répond 404 en continu pendant que `probeFranceConnectWebScreen()`
     * détecte bien un <button> "FranceConnect" dans le DOM). Android tente donc d'abord le natif
     * en best-effort (log si absent), puis retombe sur le même chemin WebView que les autres
     * plateformes plutôt que de dépendre d'un dispatch figé.
     * Cet écran peut apparaitre une 2e fois (sur iOS) à cause d'une concurrence dans la gestion d'OIDC.
     */
    async tapFranceConnect(isOkToFail = false): Promise<void> {
        // Retry court en Page Object (5s) : distingue le cas attendu (2e apparition du bouton,
        // best-effort) du cas normal (15s, absence signale un vrai bug de sélecteur). Le catch
        // reste loggé même en best-effort — un catch {} vide masquerait un sélecteur cassé.
        const timeout = isOkToFail ? 5000 : 15000

        if (driver.isAndroid) {
            const loc = getFranceConnectMireLocators()
            let tapped = false
            await browser.waitUntil(
                async () => {
                    const displayed = await this.isNativeFcButtonDisplayed()
                    if (displayed) {
                        tapped = true
                        await $(loc.fcButton).click()
                    }
                    return displayed
                },
                {timeout: 3000, interval: 500}
            ).catch(() => {
            })
            if (tapped) {
                log.info('btn natif FC trouvé et tap effectif (Android, écran natif) !!!')
                return
            }
            log.info('bouton FranceConnect natif introuvable (Android) — tentative en WebView')
        }

        await platform().inWebContext(async () => {
            try {
                await browser.waitUntil(
                    () => this.isFranceConnectTextVisible(),
                    {timeout, interval: 300}
                )
                // Reclique tant que le bouton n'a pas été trouvé, plutôt qu'un clic unique après
                // un seul findByRole — un clic isolé peut être avalé par une transition en cours
                // (concurrence OIDC, cf. commentaire de la méthode). queryByRole (non bloquant,
                // cf. webview.ts) est l'équivalent WebView de isDisplayed() côté natif.
                await browser.waitUntil(
                    async () => {
                        const fcButtonDisplayed = await this.isFranceConnectTextVisible().catch(() => false)
                        if (fcButtonDisplayed) {
                            const fcButton = await tl().queryByRole('button', {name: /^S.identifier avec FranceConnect$/i})
                            if (fcButton)
                               await fcButton.click()
                            else return false
                        }
                        return fcButtonDisplayed
                    },
                    {timeout, interval: 500, timeoutMsg: "bouton de connexion avec FranceConnect introuvable, ou tap sans effet"}
                )
                log.info('btn web FC trouvé et tap effectif !!!')
            } catch {
                const [title, url] = await Promise.all([
                    driver.execute(() => document.title) as Promise<string>,
                    browser.getUrl(),
                ]).catch(() => ['?', '?'])
                log.warn(`Pas de bouton FranceConnect affiché (title="${title}", url="${url}") — session FC déjà ouverte ?`)
                const message = "bouton de connexion avec FranceConnect introuvable"
                if (isOkToFail) {
                    // when this message stops appearing with iOS,
                    // than the second call to tapFranceConnect will have become useless.
                    log.info(message)
                } else {
                    throw new AssertionError({message})
                }
            }
        })
    }
}

export default traced(new FranceConnectMirePage(), 'FranceConnectMirePage')
