import { platform } from '../platform'
import { traced } from '@helpers/traced'
import { getSuiviDemarchesLocators } from '@locators/suivi-demarches.locators'
import {AssertionError} from "node:assert";
import logger from "@wdio/logger";
import {scalingoLogsHint} from '@helpers/partner-api'
import NavigationPage from './navigation.page'
import {clickDisplayed, hasPageText, isShown, visibleButtonTexts, waitForButtons, waitForHeading} from '@helpers/spa'

const log = logger('page-object')

const DEMARCHES_TIMEOUT_MS = 20000

// Durée maximale d'attente de la démarche : traitement serveur de la notification, puis rafraîchissements (≈ 2 s d'intervalle).
const SUIVI_WAIT_MS = 30000
// Rendu de la page après un reload, et délai entre deux rechargements.
const RELOAD_RENDER_MS = 8000
const RELOAD_INTERVAL_MS = 2000

class SuiviDemarchesPage {
    /**
     * Attend que la démarche identifiée par son titre apparaisse sur la page Suivi courante.
     * Pré-condition : déjà sur la page Suivi (appeler `HomePage.ouvreSuivi()` avant).
     *
     * La page Suivi n'a pas d'abonnement temps réel, elle ne se met à jour qu'au chargement (cf. CONTRIBUTING.md §3, règle 5) :
     * on la recharge à chaque tentative, toutes les `RELOAD_INTERVAL_MS`, jusqu'à `SUIVI_WAIT_MS`. `hasPageText` attend le rendu
     * de la page rechargée (le texte n'est pas là tant que Svelte n'a pas monté la liste). `waitUntil` réessaie les erreurs
     * WebDriver d'une tentative (reload lent, contexte en cours de remplacement) ; la dernière figure dans le message d'échec.
     */
    async waitForDemarche(title: string): Promise<void> {
        const startedAt = Date.now()
        let attempt = 0
        try {
            await browser.waitUntil(async () => {
                attempt++
                const present = await platform().inWebContext(async () => {
                    await driver.execute(() => window.location.reload())
                    // Le reload peut laisser un arbre d'accessibilité WKWebView périmé sur iOS (cf. refreshAxTree()) — no-op sur Android.
                    await platform().refreshAxTree()
                    return await hasPageText(title, RELOAD_RENDER_MS)
                })
                log.log(`[suivi] démarche "${title}" ${present ? 'visible' : 'toujours pas visible'} (tentative ${attempt}, ${Date.now() - startedAt}ms)`)
                return present
            }, {timeout: SUIVI_WAIT_MS, interval: RELOAD_INTERVAL_MS})
        } catch (err) {
            throw new AssertionError({ message: `Démarche "${title}" non visible sur le Suivi après ${Date.now() - startedAt}ms. ${scalingoLogsHint(startedAt)} (${(err as Error).message})` })
        }
    }

  /**
   * Attend qu'une carte de démarche visible corresponde à `title` et `statusLabel`.
   *
   * $$()/card.$() plutôt qu'un sélecteur de rôle : on ne sait pas à l'avance quelle carte contient `title`,
   * il faut donc lire le titre de chaque carte pour le comparer. Une fois la bonne carte
   * trouvée, lire le badge. $$() donne directement la carte, le badge
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
    const loc = getSuiviDemarchesLocators()
    const startedAt = Date.now()
    const statusLabelLower = statusLabel.toLowerCase()
    await platform().inWebContext(async () => {
      let lastStatus: string | null = null // null : aucune carte ne porte ce titre
      try {
        await browser.waitUntil(
          async () => {
            lastStatus = null
            for await (const card of $$(loc.cardContent)) {
              if (!(await card.$(loc.cardTitle).getText()).includes(title)) continue
              lastStatus = (await card.$(loc.cardBadge).getText()).trim().toLowerCase()
              return lastStatus.includes(statusLabelLower)
            }
            return false
          },
          { timeout: timeoutMs, interval: 2000 }
        )
      } catch (err) {
        // `waitUntil` réessaie les erreurs WebDriver (carte périmée…) : `err` porte la dernière si la liste est restée illisible.
        const reason = (err as Error).message
        if (lastStatus === null)
          throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms. ${scalingoLogsHint(startedAt)} (${reason})` })
        throw new AssertionError({ message: `Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastStatus}) (${reason})` })
      }
    })
  }

  /**
   * Depuis la page Suivi, ouvre la page de détail de la démarche `title` en cliquant sa tuile.
   * Ne vérifie pas l'arrivée sur la page de détail : cette sentinelle appartient à la page cible
   * (`DemarcheDetailPage.assertDisplayed(title)`, ou la méthode qui utilise réellement un élément de
   * cette page, ex. `DemarcheDetailPage.assertLienExterne`).
   * Le scénario appelant enchaîne donc, par exemple :
   * - suiviDemarchesPage.ouvreDemarche(...)
   * - demarcheDetailPage.assertDisplayed(...)
   */
  async ouvreDemarche(title: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    await platform().inWebContext(async () => {
      // Arrivée depuis une autre page (Suivi via reload, ou détail précédent) — même staleness
      // potentielle de l'arbre d'accessibilité WKWebView qu'après un redirect OIDC sur iOS.
      await platform().refreshAxTree()
      // Rôle + nom plutôt que data-testid (CONTRIBUTING §2) : le titre de la tuile est le
      // texte accessible du lien, et il est unique (horodatage) — pas besoin d'itérer les cartes.
      await clickDisplayed(getSuiviDemarchesLocators().demarcheTile(title), { timeout: timeoutMs })
    })
  }

  /**
   * Ouvre la page des démarches archivées (`/#/followup/archived`). Aucun bouton de la SPA n'y mène
   * de façon confirmée (cf. website-analysis.md § Démarches archivées) : navigation directe par route.
   */
  async openArchived(): Promise<void> {
    await NavigationPage.goToRoute('/followup/archived')
  }

  /** Partenaires listés par l'encart « Votre démarche n'apparaît pas ? » de la page des archivées. */
  async archivedPartners(): Promise<string[]> {
    await waitForHeading('Démarches archivées')
    // L'encart est un accordéon fermé par défaut : les partenaires ne sont visibles qu'une fois déplié.
    await clickDisplayed(getSuiviDemarchesLocators().archivedHelpAccordion)
    await waitForButtons(['AMI', 'Je veux suivre mes démarches'])
    const ignored = ['Retour à la page précédente', 'Je veux suivre mes démarches']
    return (await visibleButtonTexts()).filter(t => !ignored.includes(t) && !t.startsWith('Information'))
  }

  /** Vérifie l'arrivée sur la page Suivi (titre « Mes démarches »). */
  async assertDisplayed(): Promise<void> {
    await waitForHeading(getSuiviDemarchesLocators().pageTitle)
  }

    /**
     * Revient sur la page Suivi après `DemarcheDetailPage.assertLienExterne()`, qui laisse la WebView sur
     * la page du lien externe de la démarche. Observé 2026-10-06 (Android, staging) : cette page est une
     * page serveur « Not Found » (404 HTML, hors SPA) — sans bouton de retour, et des `browser.back()`
     * répétés toutes les 500 ms ressortaient de l'app avant que la SPA ait fini de se recharger.
     * Un seul retour est donc tenté ; si le titre de la page Suivi n'est pas revenu, la route SPA
     * `#/followup` est rechargée depuis l'origine de la page courante (même origine que l'app).
     */
    async retourJusquAPageSuivi(): Promise<void> {
        const loc = getSuiviDemarchesLocators()
        const pageTitle = loc.pageTitle
        await platform().inWebContext(async () => {
            if (await isShown(loc.pageTitleHeading)) return
            await browser.back()
            if (await isShown(loc.pageTitleHeading, 4000)) return

            const origin = await driver.execute(() => location.origin) as string
            log.warn(`ANOMALIE : retour arrière sans effet (page hors SPA, ex. 404 du lien externe), rechargement de ${origin}/#/followup — constaté sur Android staging le 2026-10-06, cause non confirmée.`)
            await browser.url(`${origin}/#/followup`)
            await waitForHeading(pageTitle, 20000)
        })
    }
}

export default traced(new SuiviDemarchesPage(), 'SuiviDemarchesPage')
