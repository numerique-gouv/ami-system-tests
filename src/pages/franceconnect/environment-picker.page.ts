import {getEnvironmentPickerLocators} from '../locators/franceconnect/environment-picker.locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {setBackendUrl} from '../../helpers/partner-api'
import {backendUrlFor} from '../../helpers/common/environment'

/** Seule sonde qui contourne le mode strict de `$()` : la tuile « Staging » porte deux textes identiques, la violation doit remonter et non passer pour « picker absent ». */
function rethrowStrictViolation(err: unknown): void {
    if (err instanceof Error && /strict mode violation/i.test(err.message)) throw err
}

class EnvironmentPickerPage {
    /** Écran natif, absent en webapp : l'URL de la session y détermine déjà l'environnement. */
    async isEnvironmentPickerVisible(timeout = 10000): Promise<boolean> {
        if (platform().kind === 'webapp') return false
        const loc = getEnvironmentPickerLocators()
        return await $(loc.pickerSentinel).waitForDisplayed({timeout}).catch((err: unknown) => {
            rethrowStrictViolation(err)
            return false
        })
    }

    /** Choisit l'environnement AMI_ENV dans le picker des builds staging ; sans picker, ne fait rien. Un item introuvable après le scroll est une erreur de configuration. */
    async reviewEnvironmentPicker(): Promise<void> {
        if (!await this.isEnvironmentPickerVisible()) return
        const loc = getEnvironmentPickerLocators()

        const picker = $(loc.environmentPicker)
        // Les items hors viewport ne sont pas dans l'arbre d'accessibilité ; 5 swipes bornent l'échec si AMI_ENV est faux (chacun coûte >10 s sur Android).
        await picker.scrollIntoView({
            direction: 'up', maxScrolls: 5,
            ...(loc.scrollContainer && {scrollableElement: $(loc.scrollContainer)}),
        })
        const title = await picker.getText()
        setBackendUrl(reviewTitleToApiUrl(title))
        await picker.click()
    }
}

/** « Staging » donne l'URL staging, « PR{n}: … » celle de la review app. */
function reviewTitleToApiUrl(title: string): string {
    const prMatch = title.match(/^PR(\d+):/i)
    return backendUrlFor(prMatch ? prMatch[1] : title)
}

export default traced(new EnvironmentPickerPage(), 'EnvironmentPickerPage')
