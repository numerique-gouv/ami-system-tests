import {fcEidasLocators} from '../locators/franceconnect/franceconnect-eidas.locators'
import {traced} from '../../helpers/traced'
import {tl} from '../../helpers/webview'
import {platform} from '../../platform'

class FranceConnectEidasPage {
    /**
     * Sonde dédiée eIDAS — bare (à appeler depuis un inWebContext déjà ouvert : un
     * inWebContext imbriqué re-switcherait vers NATIVE_APP dans son `finally` et casserait
     * le reste du bloc appelant, cf. commentaire équivalent dans franceconnect-mire.page.ts).
     */
    private async isEidasTileVisibleBare(): Promise<boolean> {
        const labelLower = fcEidasLocators.eidasFaibleLabel.toLowerCase()
        return await driver.execute(
            (label: string) => Array.from(document.querySelectorAll('button, a'))
                .some(el => el.textContent?.toLowerCase().includes(label)),
            labelLower
        ) as boolean
    }

    /**
     * Sonde dédiée publique, réutilisée par authenticate() (détection d'écran).
     */
    async isEidasVisible(): Promise<boolean> {
        if (!await platform().isWebContextAvailable()) return false
        return await platform().inWebContext(() => this.isEidasTileVisibleBare()).catch(() => false)
    }

    async selectEidasFaible(): Promise<void> {
        await platform().inWebContext(async () => {
            const tileTimeoutMs = 10000
            await browser.waitUntil(
                () => this.isEidasTileVisibleBare(),
                {
                    timeout: tileTimeoutMs,
                    interval: 300,
                    timeoutMsg: `Tuile "${fcEidasLocators.eidasFaibleLabel}" non visible après ${tileTimeoutMs}ms`
                }
            )
            const eidasLink = await tl().getByRole('link', {name: new RegExp(fcEidasLocators.eidasFaibleLabel, 'i')})
            await eidasLink.click()
        })
    }
}

export default traced(new FranceConnectEidasPage(), 'FranceConnectEidasPage')
