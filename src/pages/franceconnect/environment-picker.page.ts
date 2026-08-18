import {getEnvironmentPickerLocators} from '../locators/franceconnect/environment-picker.locators'
import {traced} from '../../helpers/traced'
import {platform} from '../../platform'
import {setBackendUrl} from '../../helpers/notifications-api'

class EnvironmentPickerPage {
    /**
     * Sonde dédiée, réutilisée par authenticate() (détection d'écran) et par
     * reviewEnvironmentPicker() elle-même (même sentinelle, un seul appel).
     */
    async isEnvironmentPickerVisible(timeout = 10000): Promise<boolean> {
        // Écran natif — inexistant en webapp, où l'URL de la session détermine déjà l'environnement.
        if (platform().kind === 'webapp') return false
        const loc = getEnvironmentPickerLocators()
        // "Staging" est toujours le premier item — sa présence confirme que le picker est affiché.
        return await $(loc.pickerSentinel).waitForDisplayed({timeout}).catch(() => false)
    }

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
        if (!await this.isEnvironmentPickerVisible()) return // Écran picker absent — build sans picker, no-op
        const loc = getEnvironmentPickerLocators()

        const picker = $(loc.environmentPicker)
        await this.scrollToPickerTile(picker)
        //await picker.waitForDisplayed({timeout: 5000})
        const title = await picker.getText()
        setBackendUrl(reviewTitleToApiUrl(title))
        await picker.click()
        //await picker.waitForDisplayed({timeout: 1000, reverse: true})
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

export default traced(new EnvironmentPickerPage(), 'EnvironmentPickerPage')
