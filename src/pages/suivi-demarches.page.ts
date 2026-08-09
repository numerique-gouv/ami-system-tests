import { tl, retourJusquATexteVisible } from '@helpers/webview'
import { platform } from '../platform'
import { traced } from '@helpers/traced'
import { getSuiviDemarchesLocators } from '@locators/suivi-demarches.locators'
import HomePage from './home.page'
import {AssertionError} from "node:assert";
import logger from "@wdio/logger";

const log = logger('page-object')

const DEMARCHES_TIMEOUT_MS = 20000

class SuiviDemarchesPage {
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
        let elapsed = 0
        for (const delay of backoffMs) {
            await browser.pause(delay) // hors inWebContext : laisse la page respirer entre deux rafraîchissements
            elapsed += delay
            // Un reload lent (cold-start backend, etc.) ne doit pas interrompre le backoff : on le
            // traite comme "pas encore trouvé" et on retente, au lieu de laisser l'AssertionError
            // du waitUntil interne remonter et court-circuiter les tentatives restantes.
            const rendered = await platform().inWebContext(async () => {
                await driver.execute(() => window.location.reload())
                // `readyState === 'complete'` ne signale que la fin du chargement du bundle JS,
                // pas le montage Svelte ni la résolution du fetch de la liste — juste après reload,
                // document.body.innerText est encore vide la quasi-totalité du temps (constaté en
                // debug). On attend un contenu textuel réel (liste ou état vide rendu) avant de
                // lire la page, sans quoi chaque tentative lit un DOM non peint et échoue à tort.
                return await browser.waitUntil(
                    () => driver.execute(() => document.body.innerText.trim().length > 0) as Promise<boolean>,
                    {timeout: 8000, interval: 200, timeoutMsg: 'Page Suivi non rendue après reload (contenu toujours vide)'}
                ).then(() => true).catch(() => false)
            })
            if (!rendered) {
                log.log(`[suivi] reload non rendu, on retente (≤ ${elapsed}ms)`)
                continue
            }

            const found = await platform().inWebContext(
                () => driver.execute((t: string) => document.body.innerText.includes(t), title) as Promise<boolean>
                //tl().findByText(title, {}, {timeout: 500}).then(() => true).catch(() => false)
            )

            if (found) {
                log.log(`[suivi] démarche "${title}" visible (≤ ${elapsed}ms)`)
                return
            }
            log.log(`[suivi] démarche "${title}" toujours pas visible (≤ ${elapsed}ms)`)
        }
        throw new AssertionError({ message: `Démarche "${title}" non visible sur le Suivi après ${elapsed}ms` })
    }

  /**
   * Attend qu'une carte de démarche visible corresponde à `title` et `statusLabel`.
   *
   * $$()/card.$() plutôt que tl() : on ne sait pas à l'avance quelle carte contient `title`,
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
    await platform().inWebContext(async () => {
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
   * Ne vérifie pas l'arrivée sur la page de détail : cette sentinelle appartient à la méthode
   * qui utilise réellement un élément de cette page (`DemarcheDetailPage.assertLienExterne`).
   * Le scénario appelant doit donc enchaîner :
   * - demarchesPage.ouvreDemarche(...)
   * - demarcheDetailPage.assertLienExterne(...)
   */
  async ouvreDemarche(title: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    await platform().inWebContext(async () => {
      // tl() par rôle+nom plutôt que data-testid (CONTRIBUTING §2) : le titre de la tuile est le
      // texte accessible du lien, et il est unique (horodatage) — pas besoin d'itérer les cartes.
      try {
        const link = await tl().findByRole('link', { name: title }, { timeout: timeoutMs })
        await link.click()
      } catch {
        throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" à ouvrir` })
      }
    })
  }

  /**
   * Retourne sur la page d'accueil. Délègue à `HomePage.goToHomeFromAnywhere()` : certaines
   * pages (ex. détail d'une démarche) n'ont pas de nav basse avec un lien "Accueil" cliquable,
   * cette méthode gère déjà le repli hash et le sentinel d'arrivée.
   */
  async goToHome(): Promise<void> {
    await HomePage.goToHomeFromAnywhere(15000)
  }

    /**
     * Revient sur la page Suivi (profondeur de navigation enfant inconnue) en répétant un
     * back natif jusqu'à ce que la démarche `visibleText` soit de nouveau visible dans la liste.
     * Pas de bouton retour dédié sur cet écran (contrairement au détail) : fallback direct
     * sur browser.back() à chaque itération de `goBackUntilVisible`.
     */
    async retourJusquAPageSuivi(): Promise<void> {
        let demarchesLocators = getSuiviDemarchesLocators();
        await platform().inWebContext(async () => {
            await retourJusquATexteVisible(
                () => tl()
                    .queryByRole('heading', { name: demarchesLocators.pageTitle })
                    .then((el) => el !== null)
                    .catch(() => false),
                // () => driver.execute((t: string) => document.body.innerText.includes(t),
                //     demarchesLocators.pageTitle) as Promise<boolean>,
                10000
            )
        })
    }
}

export default traced(new SuiviDemarchesPage(), 'SuiviDemarchesPage')
