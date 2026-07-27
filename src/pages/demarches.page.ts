import { withWebView, tl } from '../helpers/webview'
import { traced } from '../helpers/traced'
import { getDemarchesLocators } from './locators/demarches.locators'
import HomePage from './home.page'
import {AssertionError} from "node:assert";

const DEMARCHES_TIMEOUT_MS = 20000

class DemarchesPage {
    /**
     * Attend que la démarche identifiée par son titre apparaisse sur la page Suivi courante.
     * Pré-condition : déjà sur la page Suivi (appeler `HomePage.ouvreSuivi()` avant).
     *
     * Backend sans push testé (cf. CONTRIBUTING.md §3 "Attendre une information asynchrone") :
     * poll par backoff exponentiel avec rafraîchissement explicite à chaque tentative — même
     * stratégie que `NotificationsInboxPage.waitForNotification`. `tl().findByText()` avec
     * timeout court : le titre d'une carte est un seul nœud de texte (contrairement à
     * `assertVisibleDemarcheWith`, qui a besoin de lire le badge/lien voisins via `$$()`) —
     * une correspondance exacte par texte visible convient, pas besoin de sous-chaîne manuelle.
     */
    async waitForDemarche(title: string): Promise<void> {
        const backoffMs = [0, 500, 1000, 2000, 4000, 4000, 8000]
        for (const delay of backoffMs) {
            await browser.pause(delay) // hors withWebView : laisse la page respirer entre deux rafraîchissements
            await withWebView(async () => {
                await driver.execute(() => window.location.reload())
                await browser.waitUntil(
                    () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
                    {timeout: 5000, interval: 200, timeoutMsg: 'Page Suivi non stabilisée après reload'}
                )
            })
            const found = await withWebView(
                () => driver.execute((t: string) => document.body.innerText.includes(t), title) as Promise<boolean>
                //tl().findByText(title, {}, {timeout: 500}).then(() => true).catch(() => false)
            )

            if (found) return
        }
        throw new AssertionError({ message: `Démarche "${title}" non visible sur le Suivi après ${backoffMs.reduce((a, b) => a + b, 0)}ms` })
    }

  /**
   * Attend qu'une carte de démarche visible corresponde à `title` et `statusLabel`.
   * L'URL externe n'est plus lisible depuis la carte (elle ouvre désormais une page de
   * détail interne, cf. `ouvreDemarche` / `assertLienExterne`).
   *
   * $$()/card.$() plutôt que tl() : on ne sait pas à l'avance quelle carte contient `title`,
   * il faut donc lire le titre de chaque carte pour le comparer. Une fois la bonne carte
   * trouvée, lire le badge voisin nécessiterait de remonter du titre vers son parent avec
   * tl() — traversée interdite par CLAUDE.md. $$() donne directement la carte, le badge
   * se lit dedans sans remonter le DOM.
   *
   * Les 2 critères (titre, statut) sont vérifiés dans le même `waitUntil` avec un seul
   * `failReason`, plutôt que 2 méthodes séparées à un critère chacune : ça évite de reparcourir
   * la liste de cartes 2 fois, et le message d'échec pointe précisément lequel des 2 critères
   * n'a jamais été atteint (au lieu d'un "timeout" générique sur le dernier appel).
   */
  async assertVisibleDemarcheWith(
    title: string,
    statusLabel: string,
    timeoutMs = DEMARCHES_TIMEOUT_MS
  ): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      let failReason: 'card-not-found' | 'status-not-found' = 'card-not-found'
      let lastStatus: string | null = null
      const statusLabelLower = statusLabel.toLowerCase()
      try {
        await browser.waitUntil(
          async () => {
            failReason = 'card-not-found'
            lastStatus = null
            for await (const card of $$(loc.cardContent)) {
              const titleText = await card.$(loc.cardTitle).getText().catch(() => '')
              if (!titleText.includes(title)) continue
              failReason = 'status-not-found'
              lastStatus = (await card.$(loc.cardBadge).getText().catch(() => '')).trim().toLowerCase()
              return lastStatus.includes(statusLabelLower)
            }
            return false
          },
          {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: `Démarche "${title}" (statut "${statusLabel}") non trouvée après ${timeoutMs}ms`
          }
        )
      } catch {
        if (failReason === 'card-not-found')
          throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms` })
        throw new AssertionError({ message: `Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastStatus})` })
      }
    })
  }

  /**
   * Depuis la page Suivi, ouvre la page de détail de la démarche `title` en cliquant sa tuile.
   * Attend le bouton "Accéder à ma démarche" comme sentinelle de la page de détail chargée.
   *
   * `tl().findByRole('link', { name: title })` retrouve directement la bonne tuile (le titre,
   * horodaté, est unique) sans itérer `$$(loc.cardContent)` ni data-testid — vérifié en
   * exécution réelle (Android, `just test-android`), pas de superposition avec un autre élément
   * au point de clic.
   *
   * Un seul `withWebView()` pour le clic + l'attente : sortir du contexte WebView au milieu
   * d'une transition SPA est proscrit (CLAUDE.md — blocage ~25 s documenté sur iOS).
   */
  async ouvreDemarche(title: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      // tl() par rôle+nom plutôt que data-testid (CONTRIBUTING §2) : le titre de la tuile est le
      // texte accessible du lien, et il est unique (horodatage) — pas besoin d'itérer les cartes.
      try {
        const link = await tl().findByRole('link', { name: title }, { timeout: timeoutMs })
        await link.click()
      } catch {
        throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" à ouvrir` })
      }
      // findByRole (pas getByRole) : le clic vient de déclencher une navigation SPA, le bouton
      // n'existe pas forcément déjà dans le DOM au moment de l'appel — getByRole échoue
      // immédiatement sans réessayer, findByRole poll jusqu'à `timeout`.
      try {
        await tl().findByRole('button', { name: loc.detailExternalButtonName }, { timeout: timeoutMs })
      } catch {
        throw new AssertionError({ message: `Page de détail de "${title}" non chargée après ${timeoutMs}ms (bouton "${loc.detailExternalButtonName}" absent)` })
      }
    })
  }

  /**
   * Depuis la page de détail, clique "Accéder à ma démarche" et vérifie que la WebView
   * navigue vers `expectedUrl` (navigation JS qui remplace l'URL courante, pas de nouvelle
   * fenêtre). Revient ensuite sur la liste via la navigation native de l'app (bouton "Retour à
   * la page précédente" de la page de détail, PUIS bouton "Retour" de la nav) pour laisser
   * l'app dans un état propre entre les tests.
   *
   * `browser.back()` (une seule fois) ramène de `chrome-error://chromewebdata` (le domaine
   * partenaire `.example`, RFC 2606, ne résout jamais) à la page de détail de l'app. Le retour
   * liste se fait ensuite via le bouton de retour propre à la page de détail — la nav basse
   * (onglets Accueil/Agenda/Services/Suivi) n'existe PAS sur cet écran (confirmé en live :
   * seul un `<nav>` avec le bouton retour y est présent), contrairement à la home.
   *
   * Un seul `withWebView()` pour tout le cycle clic → vérif URL → retour, même contrainte
   * que `ouvreDemarche`.
   *
   * LIMITATION CONNUE (iOS) : Android confirmé vert (3/3). Sur iOS, le clic ouvre bien une
   * seconde fenêtre WKWebView (confirmé via `browser.getWindowHandles()`), mais celle-ci reste
   * bloquée sur `about:blank` — le domaine partenaire de test `.example` (RFC 2606) ne résout
   * jamais, et contrairement à Chrome/Android (qui affiche `chrome-error://` en conservant
   * l'URL demandée dans `getUrl()`), WebKit ne committe jamais la navigation échouée : l'URL
   * tentée n'est donc jamais observable via WebDriver sur iOS avec ce fixture. Nécessite soit
   * un domaine partenaire réellement résolvable en staging, soit une interception JS de
   * `window.open`/`location` avant le clic, pour vérifier le lien externe sur iOS.
   */
  async assertLienExterne(expectedUrl: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    const loc = getDemarchesLocators()
    await withWebView(async () => {
      const originalHandle = await browser.getWindowHandle()

      // findByRole (pas getByRole) : cf. note dans `ouvreDemarche` — pas de garantie que le DOM
      // de détail soit déjà stable juste après le retour de `ouvreDemarche()`.
      const externalButton = await tl().findByRole('button', { name: loc.detailExternalButtonName }, { timeout: timeoutMs })
      await externalButton.click()

      // Android : navigation same-document, la fenêtre courante change d'URL.
      // iOS/WKWebView : le lien externe s'ouvre dans une NOUVELLE fenêtre (confirmé en live) —
      // il faut basculer dessus pour lire son URL, `originalHandle` reste sur la page de détail.
      // browser.getUrl() (WebDriver) plutôt que `window.location.href` : le domaine partenaire
      // de staging (`.example`, RFC 2606) ne résout jamais, le document JS devient une page
      // d'erreur alors que Chromedriver/WDA conservent l'URL de navigation demandée.
      let lastUrl: string | null = null
      try {
        await browser.waitUntil(
          async () => {
            const handles = await browser.getWindowHandles()
            const targetHandle = handles.find((h) => h !== originalHandle) ?? originalHandle
            await browser.switchToWindow(targetHandle)
            lastUrl = await browser.getUrl()
            return lastUrl.includes(expectedUrl)
          },
          {
            timeout: timeoutMs,
            interval: 500,
            timeoutMsg: `URL externe "${expectedUrl}" non atteinte après ${timeoutMs}ms`
          }
        )
      } catch {
        throw new AssertionError({ message: `URL externe "${expectedUrl}" non trouvée après clic sur "${loc.detailExternalButtonName}" (dernière URL observée : ${lastUrl})` })
      }

      const handlesAfterClick = await browser.getWindowHandles()
      if (handlesAfterClick.length > 1) {
        // iOS : ferme l'onglet partenaire et retrouve la page de détail (jamais quittée).
        await browser.closeWindow()
        await browser.switchToWindow(originalHandle)
      } else {
        // Android : une seule fenêtre a navigué vers l'URL partenaire, back() la ramène au
        // document de détail (via chrome-error://chromewebdata si le domaine ne résout pas).
        await browser.back()
      }

      const backButton = await tl().findByRole('button', { name: loc.detailBackButtonName }, { timeout: timeoutMs })
      await backButton.click()

      await browser.waitUntil(
        async () => {
          const count = await $$(loc.cardContent).length
          return count > 0
        },
        { timeout: timeoutMs, interval: 500, timeoutMsg: `Retour sur la liste des démarches non confirmé après ${timeoutMs}ms` }
      )
    })
  }

  /**
   * Retourne sur la page d'accueil en cliquant sur le lien "Accueil" visible dans la nav.
   */
  async goToHome(): Promise<void> {
    await withWebView(async () => {
      const accueil = await tl().getByRole('link', { name: /Accueil/i })
      await accueil.waitForDisplayed({ timeout: 10000 })
      await accueil.click()
    })
    await HomePage.isHomeVisible(15000)
  }
}

export default traced(new DemarchesPage(), 'DemarchesPage')
