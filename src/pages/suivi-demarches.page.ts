import { platform } from '../platform'
import { traced } from '@helpers/reporting/traced'
import { suiviDemarchesLocators } from '@locators/suivi-demarches.locators'
import {AssertionError} from "node:assert";
import {publicationSentryUrl} from '@helpers/partner-api'
import NavigationPage from './navigation.page'
import {clickDisplayed, firstDisplayed, hasPageText, isShown, reloadPage, visibleButtonTexts, waitForButtons, waitForHeading} from '@helpers/spa/spa'

const DEMARCHES_TIMEOUT_MS = 20000

// Attente de la démarche : traitement serveur de la notification, puis rechargements ; rendu de la page rechargée.
const SUIVI_WAIT_MS = 30000
const RELOAD_RENDER_MS = 8000
const RELOAD_INTERVAL_MS = 2000

class SuiviDemarchesPage {
    /** Le titre de la démarche est-il dans le texte du Suivi sous `timeout` ms ? Pré-condition : `assertDisplayed()` (l'Accueil a aussi un bloc « Mes démarches »). */
    async isDemarcheListed(title: string, timeout = 1000): Promise<boolean> {
        return await hasPageText(title, timeout)
    }

    async isFollowButtonShown(timeout = 0): Promise<boolean> {
        return await isShown(suiviDemarchesLocators.followButton, timeout)
    }

    /**
     * Attend que la démarche apparaisse sur le Suivi (pré-condition : y être déjà). La page n'a pas d'abonnement temps réel (CONTRIBUTING.md §3) :
     * on la recharge à chaque tentative, y compris pour une démarche déjà listée dont le titre ou le statut change.
     */
    async waitForDemarche(title: string): Promise<void> {
        await this.assertDisplayed()
        const startedAt = Date.now()
        try {
            await browser.waitUntil(async () => {
                await reloadPage()
                await platform().refreshAxTree()
                return await hasPageText(title, RELOAD_RENDER_MS)
            }, {timeout: SUIVI_WAIT_MS, interval: RELOAD_INTERVAL_MS})
        } catch (err) {
            const sentry = publicationSentryUrl(title)
            throw new AssertionError({ message: `Démarche "${title}" non visible sur le Suivi après ${Date.now() - startedAt}ms.${sentry ? ` Trace Sentry de l'envoi : ${sentry}` : ''} (${(err as Error).message})` })
        }
    }

  /** Attend qu'une carte corresponde à `title` et `statusLabel`, les deux critères dans un même `waitUntil` pour que le message dise lequel manque. */
  async assertVisibleDemarcheWith(
    title: string,
    statusLabel: string,
    timeoutMs = DEMARCHES_TIMEOUT_MS
  ): Promise<void> {
    await this.assertDisplayed()
    const statusLabelLower = statusLabel.toLowerCase()
    let lastStatus: string | null = null // null : aucune carte ne porte ce titre
    try {
      await browser.waitUntil(
        async () => {
          lastStatus = null
          for await (const card of $$(suiviDemarchesLocators.cardContent)) {
            if (!(await card.$(suiviDemarchesLocators.cardTitle).getText()).includes(title)) continue
            lastStatus = (await card.$(suiviDemarchesLocators.cardBadge).getText()).trim().toLowerCase()
            return lastStatus.includes(statusLabelLower)
          }
          return false
        },
        { timeout: timeoutMs, interval: 2000 }
      )
    } catch (err) {
      const reason = (err as Error).message
      if (lastStatus === null)
        throw new AssertionError({ message: `Carte introuvable : aucune démarche avec le titre "${title}" après ${timeoutMs}ms (${reason})` })
      throw new AssertionError({ message: `Statut "${statusLabel}" non trouvé pour "${title}" après ${timeoutMs}ms (dernière valeur : ${lastStatus}) (${reason})` })
    }
  }

  /** Ouvre le détail de la démarche `title` en cliquant sa tuile (nom accessible unique, horodaté). L'arrivée se vérifie par `DemarcheDetailPage.assertDisplayed(title)`. */
  async ouvreDemarche(title: string, timeoutMs = DEMARCHES_TIMEOUT_MS): Promise<void> {
    await platform().refreshAxTree()
    await clickDisplayed(suiviDemarchesLocators.demarcheTile(title), { timeout: timeoutMs })
  }

  /** Aucun bouton de la SPA n'y mène de façon confirmée : navigation directe par route. */
  async openArchived(): Promise<void> {
    await NavigationPage.goToRoute('/followup/archived')
  }

  /** Partenaires listés par l'encart « Votre démarche n'apparaît pas ? » de la page des archivées. */
  async archivedPartners(): Promise<string[]> {
    await waitForHeading(suiviDemarchesLocators.archivedTitle)
    // Déplié au chargement : un clic le refermerait.
    if (await isShown(suiviDemarchesLocators.archivedHelpAccordionCollapsed, 1000)) {
      await clickDisplayed(suiviDemarchesLocators.archivedHelpAccordion)
    }
    await waitForButtons(suiviDemarchesLocators.archivedExpectedButtons)
    return (await visibleButtonTexts()).filter(t => !suiviDemarchesLocators.archivedIgnoredTexts.includes(t) && !t.startsWith(suiviDemarchesLocators.archivedInfoPrefix))
  }

  /** Le h1 « Mes démarches » : le h2 du même nom existe aussi sur l'Accueil, qu'un `waitForHeading` validerait à tort. */
  async assertDisplayed(): Promise<void> {
    await firstDisplayed(suiviDemarchesLocators.pageTitleH1, {timeout: 10000})
  }

    /** Revient sur le Suivi après `DemarcheDetailPage.assertLienExterne()`, qui laisse la WebView sur la page du lien externe (404 serveur hors SPA, sans bouton de retour). */
    async retourJusquAPageSuivi(): Promise<void> {
        const pageTitle = suiviDemarchesLocators.pageTitle
        if (await isShown(suiviDemarchesLocators.pageTitleHeading)) return
        // Sur mobile le retour arrière est sans effet : seule la webapp le tente.
        if (platform().kind === 'webapp') {
            await browser.back()
            if (await isShown(suiviDemarchesLocators.pageTitleHeading, 4000)) return
        }

        const origin = await driver.execute(() => location.origin) as string
        await browser.url(`${origin}/#/followup`)
        await waitForHeading(pageTitle, 20000)
    }
}

export default traced(new SuiviDemarchesPage(), 'SuiviDemarchesPage')
