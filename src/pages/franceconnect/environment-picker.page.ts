import {getEnvironmentPickerLocators} from '../locators/franceconnect/environment-picker.locators'
import {traced} from '../../helpers/reporting/traced'
import {platform} from '../../platform'
import {setBackendUrl} from '../../helpers/partner-api'
import {backendUrlFor} from '../../helpers/environment'

/**
 * SEUL endroit du dépôt où le mode strict de `$()` (WDIO 10) est contourné : la tuile « Staging » du picker
 * porte deux textes identiques (titre et sous-titre), donc un sélecteur trop large la désigne deux fois. Une
 * sonde qui avale toutes les erreurs la prendrait pour « picker absent » (21 échecs Android constatés le
 * 2026-10-08, sans un mot). La violation doit remonter ; toute autre erreur reste « absent ».
 * Ailleurs, un sélecteur natif est unique : pas de `.catch` sur les sondes.
 */
function rethrowStrictViolation(err: unknown): void {
    if (err instanceof Error && /strict mode violation/i.test(err.message)) throw err
}

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
        return await $(loc.pickerSentinel).waitForDisplayed({timeout}).catch((err: unknown) => {
            rethrowStrictViolation(err)
            return false
        })
    }

    /**
     * Sélectionne l'environnement dans le review-picker staging si visible (no-op sinon).
     * Le picker apparaît uniquement sur les builds staging avec plusieurs review apps.
     *
     * Étape 1 — détecte si l'écran picker est affiché : attend l'item "Staging" (toujours
     * en tête de liste). Si absent après 10 s → build sans picker, retour silencieux.
     *
     * Étape 2 — scroll jusqu'à l'item AMI_ENV et cliquer. Si l'item cible est introuvable
     * malgré le scroll, l'erreur se propage (configuration AMI_ENV incorrecte).
     */
    async reviewEnvironmentPicker(): Promise<void> {
        if (!await this.isEnvironmentPickerVisible()) return // Écran picker absent — build sans picker, no-op
        const loc = getEnvironmentPickerLocators()

        const picker = $(loc.environmentPicker)
        // Liste longue (LazyColumn Android, ScrollView iOS) : les items hors viewport ne sont pas rendus dans
        // l'arbre d'accessibilité. 'up' = le doigt monte, le contenu défile vers le bas (défaut de WDIO). Un swipe
        // couvre ~95 % de la liste, mais coûte >10 s sur Android : 5 suffisent, et bornent l'échec si AMI_ENV est faux.
        await picker.scrollIntoView({
            direction: 'up', maxScrolls: 5,
            ...(loc.scrollContainer && {scrollableElement: $(loc.scrollContainer)}),
        })
        const title = await picker.getText()
        setBackendUrl(reviewTitleToApiUrl(title))
        await picker.click()
    }
}

/**
 * Dérive l'URL backend depuis le titre d'un item du review-picker.
 * Format titre : "Staging" → URL staging, "PR{n}: ..." → URL review app PR.
 */
function reviewTitleToApiUrl(title: string): string {
    const prMatch = title.match(/^PR(\d+):/i)
    return backendUrlFor(prMatch ? prMatch[1] : title)
}

export default traced(new EnvironmentPickerPage(), 'EnvironmentPickerPage')
