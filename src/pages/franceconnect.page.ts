import {fcpLocators} from './locators/franceconnect.locators'
import {traced} from '../helpers/traced'
import {withWebView, refreshAxTree, tl} from '../helpers/webview'
import type {TestUser} from '../helpers/test-users'

class FranceConnectPage {
    /**
     * Sélectionne le niveau d'assurance eiDAS "faible" si la page de sélection est visible.
     * No-op si la session FC est déjà ouverte
     * Doit être appelé dans un contexte WebView (ou via withWebView).
     */
    async selectEidasFaible(): Promise<void> {
        // La navigation vers le serveur FC est asynchrone (surtout sur iOS) : on peut
        // arriver ici avant que la page eIDAS ait remplacé la SPA. On attend la tuile
        // elle-même. driver.execute() est synchrone donc survit à une navigation en cours
        // (cf. webview-quirks.md), contrairement aux queries Testing Library (executeAsync).
        const tileTimeoutMs = 5000
        const labelLower = fcpLocators.eidasFaibleLabel.toLowerCase()
        let eIDASSelectionDisplayed = await browser.waitUntil(
            async () => driver.execute(
                (label: string) => Array.from(document.querySelectorAll('button, a'))
                    .some(el => el.textContent?.toLowerCase().includes(label)),
                labelLower
            ) as Promise<boolean>,
            { timeout: tileTimeoutMs, interval: 300, timeoutMsg: `Tuile "${fcpLocators.eidasFaibleLabel}" non visible après ${tileTimeoutMs}ms` }
        ).catch(ex => {
                console.warn("Pas de sélection d'eiDAS faible affichée, session FC déjà ouverte", ex)
                return false
            }
        );
        if (eIDASSelectionDisplayed) {
            //await refreshAxTree()
            const eidasLink = await tl().getByRole('link', {name: new RegExp(fcpLocators.eidasFaibleLabel, 'i')})
            await eidasLink.click()
        }
    }

    /**
     * Remplit le formulaire FCP-LOW avec les credentials du compte sandbox.
     * Doit être appelé dans un contexte WebView (ou via withWebView).
     */
    async fillCredentials(identifier: string, password: string): Promise<void> {
        await $(fcpLocators.fcpLowHeading).waitForDisplayed({timeout: 10000})
        const idField = await tl().getByLabelText(/identifiant/i)
        await idField.scrollIntoView()
        await idField.clearValue()
        await idField.setValue(identifier)
        const pwdField = await tl().getByLabelText(/mot de passe/i)
        await pwdField.scrollIntoView()
        await pwdField.clearValue()
        await pwdField.setValue(password)
    }

    /**
     * Soumet le formulaire et attend la disparition de la page FCP-LOW (redirect OIDC terminé).
     * Doit être appelé dans un contexte WebView (ou via withWebView).
     */
    async submit(): Promise<void> {
        try {
            // Clic natif via Testing Library : passe par le vrai hit-testing (un overlay
            // natif comme le clavier ou la toolbar Android peut l'intercepter, contrairement
            // à un clic JS synthétique).
            const submitBtn = await tl().getByRole('button', {name: /valider/i})
            await submitBtn.click()
        } catch (e) {
            // Fallback confirmé nécessaire sur iOS/fip1-low : $() ne trouve pas les éléments
            // de cette page même après refreshAxTree() (bug WKRDP documenté, cf. fillCredentials).
            console.warn('[franceconnect] submit(): clic natif tl() en échec, fallback driver.execute()', e)
            await driver.execute(() => {
                const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]')
                btn?.click()
            })
        }
        const urlBeforeSubmit = await driver.getUrl().catch(() => '')
        await browser.waitUntil(
            async () => (await driver.getUrl().catch(() => urlBeforeSubmit)) !== urlBeforeSubmit,
            {timeout: 15000, interval: 300, timeoutMsg: 'Redirect OIDC post-submit non détecté en 15s'}
        )
    }

    /**
     * Login complet avec le compte sandbox FranceConnect staging.
     * Chaîne : sélection eiDAS → remplissage formulaire FCP-LOW → soumission.
     *
     * Un seul withWebView couvre tout le flow OIDC (SPA → fcp-low → fip1-low).
     * Sur iOS/WKWebView, sortir du contexte WEBVIEW après une navigation cross-origin
     * rend le contexte WKRDP non-ré-inspectable (waitForWebViewContext bloque 25s).
     * Les interactions sur fip1-low utilisent driver.execute() car $() échoue
     * après plusieurs redirections cross-origin (bug WKRDP connu sur iOS).
     */
    async loginWithSandbox(user: TestUser): Promise<void> {
        await withWebView(async () => {
            await this.selectEidasFaible()
            try {
                await refreshAxTree()
                await this.fillCredentials(user.login, user.password)
                await this.submit()
            } catch (ex) {
                // Best-effort : la session FC peut déjà être ouverte (cf. selectEidasFaible).
                // Loggé quand même — une vraie erreur d'interaction (champ/bouton introuvable)
                // sur cette chaîne critique ne doit pas se confondre avec ce cas attendu.
                console.warn('loginWithSandbox: échec sur la page credentials', ex)
            }
        })
    }
}

export default traced(new FranceConnectPage(), 'FranceConnectPage')
