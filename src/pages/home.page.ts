import {getHomeLocators} from './locators/home.locators'
import {withWebView} from '../helpers/webview'

class HomePage {
    /** Retourne true si le conteneur WebView natif est affiché. */
    async isVisible(): Promise<boolean> {
        try {
            const loc = getHomeLocators()
            return await $(loc.screenRoot).isDisplayed()
        } catch {
            return false
        }
    }

    /**
     * Attend que le conteneur WebView natif soit visible.
     * L'app AMI est 100% SPA — pas de resource-id natif, on détecte la WebView elle-même.
     */
    async waitForVisible(timeout = 30000): Promise<void> {
        const {width, height} = await driver.getWindowSize()
        await driver.action('pointer', {parameters: {pointerType: 'touch'}})
            .move({duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.4)})
            .down({button: 0})
            .move({duration: 300, x: Math.round(width / 2), y: Math.round(height * 0.5)})
            .up({button: 0})
            .perform()
        const loc = getHomeLocators()
        await $(loc.screenRoot).waitForDisplayed({timeout})
    }

    /**
     * Attend que la SPA home authentifiée soit chargée.
     * Vérifie la couche native (waitForVisible) puis la nav WebView (lien "Suivi" visible).
     * Remplace waitForSpaReady — un seul point de vérité pour "la home est prête".
     * Retourne true si prête dans le délai, false sinon (ne throw pas).
     */
    /**
     * Attend que la SPA home authentifiée soit chargée.
     * Utilise driver.execute (JS sync) pour détecter le lien "Suivi" visible dans la nav.
     * Les async scripts (tl().findByRole) sont tués lors de la navigation post-OIDC,
     * d'où l'usage du JS synchrone qui retourne immédiatement lors d'une navigation.
     */
    async isHomeVisible(timeout = 30000): Promise<boolean> {
        try {
            await this.waitForVisible(timeout)
            return await withWebView(async () => {
                await browser.waitUntil(
                    async () => {
                        try {
                            return await driver.execute(() =>
                                Array.from(document.querySelectorAll('a'))
                                    .some(a => a.textContent?.trim() === 'Suivi' && (a as HTMLElement).offsetParent !== null)
                            ) as boolean
                        } catch {
                            return false
                        }
                    },
                    {timeout, interval: 1000, timeoutMsg: `SPA home non prête — lien "Suivi" absent après ${timeout}ms`}
                )
                return true
            })
        } catch {
            return false
        }
    }

    /**
     * Attend que la démarche identifiée par son titre apparaisse sur la home.
     *
     * Stratégie : navigation vers Accueil (clic sur le lien de nav SPA) plutôt que
     * pull-to-refresh. Sur iOS, le geste pull-to-refresh ne déclenche pas le refetch
     * du widget "Mes démarches" de façon fiable, alors que la navigation SPA force
     * un re-render + fetch. Si la démarche n'est pas encore visible, on re-navigue
     * toutes les 10 s pour relancer le fetch.
     */
    async waitForDemarche(title: string, timeout = 30000): Promise<void> {
        const deadline = Date.now() + timeout
        let found = false
        while (!found) {
            // Clic sur le lien "Accueil" dans la nav SPA pour forcer le rechargement du widget.
            await withWebView(async () => {
                await driver.execute(() => {
                    const a = Array.from(document.querySelectorAll('a'))
                        .find(el => el.textContent?.trim() === 'Accueil') as HTMLElement | undefined
                    a?.click()
                })
            })
            const remaining = deadline - Date.now()
            if (remaining <= 0) break
            found = await withWebView(async () => {
                try {
                    await browser.waitUntil(
                        async () => driver.execute(
                            (t: string) => document.body.innerText.includes(t),
                            title
                        ) as Promise<boolean>,
                        { timeout: Math.min(remaining, 10000), interval: 1000 }
                    )
                    return true
                } catch { return false }
            })
        }
        if (!found) throw new Error(`Démarche "${title}" non visible sur la home après ${timeout}ms`)
    }

    /**
     * Glissement natif vers le bas (haut de l'écran → milieu) pour déclencher
     * le pull-to-refresh de la liste home.
     */
    async pullToRefresh(): Promise<void> {
        const {width, height} = await driver.getWindowSize()
        await driver.action('pointer', {parameters: {pointerType: 'touch'}})
            .move({duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25)})
            .down({button: 0})
            .move({duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65)})
            .up({button: 0})
            .perform()
    }

    /**
     * Navigue vers la section "Suivi" en cliquant sur le lien visible dans la nav.
     * Attend que le titre "Mes démarches" soit visible pour confirmer la navigation.
     */
    async ouvreSuivi(): Promise<void> {
        await withWebView(async () => {
            await browser.waitUntil(
                async () => await driver.execute(() => {
                    const link = Array.from(document.querySelectorAll('a'))
                        .find(a => a.textContent?.trim() === 'Suivi') as HTMLElement | undefined
                    if (!link) return false
                    link.click()
                    return true
                }) as boolean,
                { timeout: 10000, interval: 500, timeoutMsg: 'Lien "Suivi" introuvable dans la nav' }
            )
            await browser.waitUntil(
                async () => await driver.execute(() =>
                    Array.from(document.querySelectorAll('h1, h2')).some(h => h.textContent?.includes('démarches'))
                ) as boolean,
                {
                    timeout: 10000,
                    interval: 300,
                    timeoutMsg: 'Heading "Mes démarches" absent après navigation vers Suivi'
                }
            )
        })
    }

    /** Ouvre le premier partenaire/item de la liste en tapant dessus dans la WebView. */
    async openFirstPartner(): Promise<void> {
        await withWebView(async () => {
            const item = $('//*[@aria-label and @tabindex="0"][1]')
            await item.click()
        })
    }
}

export default new HomePage()
