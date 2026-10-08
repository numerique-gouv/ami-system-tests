import { platform } from '../platform'
import { traced } from '@helpers/traced'
import { getSuiviDemarchesLocators } from '@locators/suivi-demarches.locators'
import HomePage from './home.page'
import {AssertionError} from "node:assert";
import logger from "@wdio/logger";
import {scalingoLogsHint} from '@helpers/notifications-api'
import NavigationPage from './navigation.page'
import {clickButton, visibleButtonTexts, waitForButtons, waitForHeading, findRole, queryRole} from '@helpers/spa'

const log = logger('page-object')

const DEMARCHES_TIMEOUT_MS = 20000

// Durée maximale d'attente de la démarche : traitement serveur de la notification, puis rafraîchissements (≈ 2 s d'intervalle).
const SUIVI_WAIT_MS = 30000

class SuiviDemarchesPage {
    /**
     * Attend que la démarche identifiée par son titre apparaisse sur la page Suivi courante.
     * Pré-condition : déjà sur la page Suivi (appeler `HomePage.ouvreSuivi()` avant).
     *
     * La page Suivi n'a pas d'abonnement temps réel, elle ne se met à jour qu'au chargement (cf. CONTRIBUTING.md §3, règle 5) :
     * poll par backoff exponentiel avec rafraîchissement explicite à chaque tentative — même
     * stratégie que `NotificationsInboxPage.assertNotificationReceived`. La présence du titre est lue
     * par `driver.execute` (texte visible de la page) après chaque rechargement : un seul aller-retour
     * synchrone, sans handle d'élément susceptible de devenir périmé pendant le rendu. Contrairement à
     * `assertVisibleDemarcheWith`, aucun badge ni lien voisin n'est lu ici.
     */
    async waitForDemarche(title: string): Promise<void> {
        const startedAt = Date.now()
        let attempts = 0
        // Dernière erreur WebDriver/rendu d'une tentative non rendue : si la page n'a jamais pu être lue,
        // l'échec ne dit rien du traitement serveur (pas de renvoi vers les logs Scalingo).
        let lastRenderError: string | null = null
        let lastAttemptRendered = false
        let fatal: unknown = null
        // `waitUntil` porte l'intervalle entre deux rafraîchissements (il remplace l'ancien backoff par `browser.pause`) et
        // avale les erreurs de sa condition : une erreur inattendue est mémorisée puis relancée ci-dessous.
        const found = await browser.waitUntil(async () => {
            attempts++
            try {
                // Un reload lent (cold-start backend, etc.) ne doit pas interrompre les tentatives : on le
                // traite comme "pas encore trouvé" et on retente.
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
                    ).then(() => true).catch((err: Error) => {
                        lastRenderError = err.message
                        return false
                    })
                })
                lastAttemptRendered = rendered
                if (!rendered) {
                    log.log(`[suivi] reload non rendu, on retente (tentative ${attempts}, ${Date.now() - startedAt}ms)`)
                    return false
                }
                const present = await platform().inWebContext(async () => {
                    // Le reload qui précède peut laisser un arbre d'accessibilité WKWebView périmé sur
                    // iOS (cf. refreshAxTree()) — no-op sur Android.
                    await platform().refreshAxTree()
                    return driver.execute((t: string) => document.body.innerText.includes(t), title) as Promise<boolean>
                })
                log.log(`[suivi] démarche "${title}" ${present ? 'visible' : 'toujours pas visible'} (tentative ${attempts}, ${Date.now() - startedAt}ms)`)
                return present
            } catch (err) {
                fatal = err
                return true
            }
        }, {timeout: SUIVI_WAIT_MS, interval: 2000}).then(() => true).catch(() => false)
        if (fatal) throw fatal
        if (found) return
        const elapsed = Date.now() - startedAt
        if (!lastAttemptRendered)
            throw new AssertionError({ message: `Page Suivi illisible après ${elapsed}ms (dernière erreur : ${lastRenderError}) — la présence de la démarche "${title}" n'a pas pu être vérifiée.` })
        throw new AssertionError({ message: `Démarche "${title}" non visible sur le Suivi après ${elapsed}ms. ${scalingoLogsHint(startedAt)}` })
    }

  /**
   * Attend qu'une carte de démarche visible corresponde à `title` et `statusLabel`.
   *
   * $$()/card.$() plutôt que findRole : on ne sait pas à l'avance quelle carte contient `title`,
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
    await platform().inWebContext(async () => {
      let failReason: 'card-not-found' | 'status-not-found' = 'card-not-found'
      let lastStatus: string | null = null
      // Erreur WebDriver de la dernière tentative (contexte perdu, élément périmé…) : distincte de
      // « carte absente », elle ne doit pas renvoyer vers les logs Scalingo.
      let lastError: string | null = null
      const statusLabelLower = statusLabel.toLowerCase()
      try {
        await browser.waitUntil(
          async () => {
            failReason = 'card-not-found'
            lastStatus = null
            lastError = null
            try {
              for await (const card of $$(loc.cardContent)) {
                const titleText = await card.$(loc.cardTitle).getText()
                if (!titleText.includes(title)) continue
                failReason = 'status-not-found'
                lastStatus = (await card.$(loc.cardBadge).getText()).trim().toLowerCase()
                return lastStatus.includes(statusLabelLower)
              }
            } catch (err) {
              lastError = (err as Error).message
            }
            return false
          },
          {
            timeout: timeoutMs,
            interval: 2000,
            timeoutMsg: `Démarche "${title}" (statut "${statusLabel}") non trouvée après ${timeoutMs}ms`
          }
        )
      } catch (err) {
        log.warn('Suivi : démarche/statut non trouvé', err)
        if (lastError)
          throw new AssertionError({ message: `Liste du Suivi illisible après ${timeoutMs}ms (dernière erreur : ${lastError}) — la démarche "${title}" n'a pas pu être vérifiée.` })
        if (failReason === 'card-not-found')
          throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms. ${scalingoLogsHint(startedAt)}` })
        throw new AssertionError({ message: `Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastStatus})` })
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
      // findRole par rôle+nom plutôt que data-testid (CONTRIBUTING §2) : le titre de la tuile est le
      // texte accessible du lien, et il est unique (horodatage) — pas besoin d'itérer les cartes.
      try {
        const link = await findRole('button', title, { timeout: timeoutMs })
        await link.click()
      } catch (err) {
        log.warn('Suivi : ouverture de la démarche impossible', err)
        throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" à ouvrir` })
      }
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
    await clickButton(/Votre démarche n.apparaît pas/)
    await waitForButtons(['AMI', 'Je veux suivre mes démarches'])
    const ignored = ['Retour à la page précédente', 'Je veux suivre mes démarches']
    return (await visibleButtonTexts()).filter(t => !ignored.includes(t) && !t.startsWith('Information'))
  }

  /** Vérifie l'arrivée sur la page Suivi (titre « Mes démarches »). */
  async assertDisplayed(): Promise<void> {
    await waitForHeading(getSuiviDemarchesLocators().pageTitle)
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
     * Revient sur la page Suivi après `DemarcheDetailPage.assertLienExterne()`, qui laisse la WebView sur
     * la page du lien externe de la démarche. Observé 2026-10-06 (Android, staging) : cette page est une
     * page serveur « Not Found » (404 HTML, hors SPA) — sans bouton de retour, et des `browser.back()`
     * répétés toutes les 500 ms ressortaient de l'app avant que la SPA ait fini de se recharger.
     * Un seul retour est donc tenté ; si le titre de la page Suivi n'est pas revenu, la route SPA
     * `#/followup` est rechargée depuis l'origine de la page courante (même origine que l'app).
     */
    async retourJusquAPageSuivi(): Promise<void> {
        const demarchesLocators = getSuiviDemarchesLocators()
        const isSuiviVisible = (): Promise<boolean> => queryRole('heading', demarchesLocators.pageTitle)
            .then((el) => el !== null)
            .catch((ex) => {
                log.warn('retourJusquAPageSuivi: sonde du titre de la page Suivi en échec', ex)
                return false
            })

        await platform().inWebContext(async () => {
            if (await isSuiviVisible()) return
            await browser.back()
            const backOk = await browser.waitUntil(isSuiviVisible, {
                timeout: 4000, interval: 500,
                timeoutMsg: `Page Suivi (titre "${demarchesLocators.pageTitle}") non revenue après browser.back()`,
            }).then(() => true).catch((ex) => {
                log.debug('retourJusquAPageSuivi: page Suivi non revenue après browser.back()', ex)
                return false
            })
            if (backOk) return

            const origin = await driver.execute(() => location.origin) as string
            log.warn(`ANOMALIE : retour arrière sans effet (page hors SPA, ex. 404 du lien externe), rechargement de ${origin}/#/followup — constaté sur Android staging le 2026-10-06, cause non confirmée.`)
            await browser.url(`${origin}/#/followup`)
            await browser.waitUntil(isSuiviVisible, {
                timeout: 20000, interval: 500,
                timeoutMsg: `Page Suivi (titre "${demarchesLocators.pageTitle}") non atteinte après rechargement de ${origin}/#/followup`,
            })
        })
    }
}

export default traced(new SuiviDemarchesPage(), 'SuiviDemarchesPage')
