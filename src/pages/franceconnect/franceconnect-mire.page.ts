import {getFranceConnectMireLocators} from '../locators/franceconnect/franceconnect-mire.locators'
import {traced} from '../../helpers/traced'
import {tl} from '../../helpers/webview'
import {platform} from '../../platform'
import logger from "@wdio/logger";
import {AssertionError} from "node:assert";

const log = logger('page-object')

// Signature d'une page d'erreur technique du fournisseur d'identité de démonstration FCP-LOW
// (ex. "code : Y000000", "id: 887ae5c4-…"), distincte des écrans normaux du flow
// (login/eIDAS/credentials) — observée en pratique quand le sandbox externe est en
// maintenance ou instable.
const FC_ERROR_CODE_PATTERN = /code\s*:\s*(\S+)/i
const FC_ERROR_ID_PATTERN = /id\s*:\s*(\S+)/i

/**
 * Erreur fournisseur FCP-LOW (page technique hors contrôle de l'app AMI) : distincte des
 * échecs applicatifs pour permettre à l'appelant (tapFranceConnect) de faire un retour natif
 * avant de remonter l'échec — les boucles de retry de authenticate.process.ts reprennent
 * ensuite la séquence depuis l'écran 'login'.
 */
export class FranceConnectProviderError extends Error {
    constructor(readonly code: string, readonly providerId: string | undefined, url: string) {
        super(`Le fournisseur d'identité de démonstration FranceConnect renvoie une page d'erreur (code: ${code}, id: ${providerId ?? '?'}, url="${url}")`)
    }
}

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
     * Détecte la page d'erreur technique FCP-LOW — bare (à appeler depuis un inWebContext déjà
     * ouvert, même contrainte que isFranceConnectTextVisible() ci-dessus). Réutilisée par
     * probeFranceConnectWebScreen() (authenticate.process.ts) pour distinguer cette page
     * technique du vrai formulaire credentials, qui partage le même bandeau générique
     * "Fournisseur d'identité de démonstration - FCP-LOW".
     */
    async detectProviderErrorBare(): Promise<FranceConnectProviderError | null> {
        const bodyText = await driver.execute(() => document.body.innerText).catch(() => '') as string
        const errorCode = bodyText.match(FC_ERROR_CODE_PATTERN)?.[1]
        if (!errorCode) return null
        const providerId = bodyText.match(FC_ERROR_ID_PATTERN)?.[1]
        const url = await browser.getUrl().catch(() => '?')
        return new FranceConnectProviderError(errorCode, providerId, url)
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
                const fcButton = await tl().getByRole('button', {name: /^S.identifier avec FranceConnect$/i})
                await fcButton.click()
                log.info('btn web FC trouvé et tap effectif !!!')
            } catch {
                const [title, url] = await Promise.all([
                    driver.execute(() => document.title) as Promise<string>,
                    browser.getUrl(),
                ]).catch(() => ['?', '?'])
                log.warn(`Pas de bouton FranceConnect affiché (title="${title}", url="${url}") — session FC déjà ouverte ?`)
                const bodyText = await driver.execute(() => document.body.innerText).catch(() => '') as string
                const errorCode = bodyText.match(FC_ERROR_CODE_PATTERN)?.[1]
                if (errorCode) {
                    const providerId = bodyText.match(FC_ERROR_ID_PATTERN)?.[1]
                    // Panne/instabilité du sandbox externe FCP-LOW, pas un cas applicatif toléré
                    // (cf. isOkToFail ci-dessous). Remonte une erreur typée plutôt qu'un throw
                    // direct : l'appelant (hors inWebContext, donc de retour en NATIVE_APP) doit
                    // encore faire un retour natif avant que l'échec ne remonte à
                    // authenticate.process.ts pour reprise de la séquence.
                    throw new FranceConnectProviderError(errorCode, providerId, url)
                }
                const message = "bouton de connexion avec FranceConnect introuvable"
                if (isOkToFail) {
                    // when this message stops appearing with iOS,
                    // than the second call to tapFranceConnect will have become useless.
                    log.info(message)
                } else {
                    throw new AssertionError({message})
                }
            }
        }).catch(async (err: unknown) => {
            if (!(err instanceof FranceConnectProviderError)) throw err
            // Log explicite (code + id) pour faciliter le signalement à l'équipe FranceConnect,
            // indépendamment du message d'échec de test.
            log.error(`FranceConnect FCP-LOW : page d'erreur fournisseur détectée (code=${err.code}, id=${err.providerId ?? '?'})`)
            // inWebContext() a déjà restauré le contexte NATIVE_APP dans son `finally` : le back()
            // agit ici sur le bouton/geste natif (pas l'historique de la WebView), pour quitter
            // le navigateur intégré et revenir à l'écran AMI précédent.
            await driver.back().catch((backErr: unknown) =>
                log.warn('tapFranceConnect: driver.back() après erreur FCP-LOW a échoué', backErr))
            // Erreur "normale" (non permanente) pour authenticate.process.ts : son while() attrape
            // ce throw et relance runSequenceFrom() depuis l'écran détecté, cf. commentaire de
            // getAppToStartingState().
            throw new AssertionError({message: err.message})
        })
    }
}

export default traced(new FranceConnectMirePage(), 'FranceConnectMirePage')
