import { traced } from '@helpers/reporting/traced'
import { demarcheDetailLocators } from '@locators/demarche-detail.locators'
import {AssertionError} from "node:assert";
import {clickDisplayed, hasPageText, isShown, pageText, waitForPageText} from '@helpers/spa/spa'

const DEMARCHE_DETAIL_TIMEOUT_MS = 20000

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

/** L'URL du lien externe peut porter un `id_token` (SSO) : jamais dans un message d'erreur. */
function maskIdToken(url: string | null): string | null {
  return url?.replace(/(id_token=)[^&#]*/g, '$1***') ?? url
}

class DemarcheDetailPage {
  /** « référence dossier » n'existe que sur le détail : le titre est aussi dans la liste du Suivi, affichée un instant après le clic. */
  async assertDisplayed(title: string): Promise<void> {
    await waitForPageText('référence dossier')
    await waitForPageText(title)
  }

  async assertReference(reference: string): Promise<void> {
    await waitForPageText(`référence dossier : ${reference}`)
  }

  /** Le bouton « Accéder à ma démarche » n'existe que si une notification reçue de la démarche porte un `content_link`. */
  async isLienExterneProposed(timeout = 2000): Promise<boolean> {
    return await isShown(demarcheDetailLocators.detailExternalButton, timeout)
  }

  async hasText(text: string, timeout = 1000): Promise<boolean> {
    return await hasPageText(text, timeout)
  }

  /** Attend qu'une démarche enfant (titre = le `subheading` publié) soit listée dans le détail du parent. */
  async assertChildListed(childTitle: string): Promise<void> {
    await waitForPageText(childTitle)
  }

  async hasChild(childTitle: string): Promise<boolean> {
    return (await pageText()).includes(childTitle)
  }

  /** Vérifie statut, titre, partenaire, référence dossier et historique chronologique des messages, sans quitter la SPA. */
  async assertDetail(expected: {title: string; statusLabel: string; reference: string; messages: string[]}): Promise<void> {
    await this.assertDisplayed(expected.title)
    const text = await pageText()
    for (const part of [expected.statusLabel.toUpperCase(), expected.title, 'AMI', `référence dossier : ${expected.reference}`, 'Messages', ...expected.messages]) {
      if (!text.includes(part))
        throw new AssertionError({message: `Détail de la démarche : "${part}" absent (texte : ${text.slice(0, 400)})`})
    }
    const positions = expected.messages.map(m => text.indexOf(m))
    if (positions.some((p, i) => i > 0 && p < positions[i - 1]))
      throw new AssertionError({message: `Historique dans le désordre : ${expected.messages.join(' → ')} (positions ${positions.join(', ')})`})
  }

  /**
   * Clique « Accéder à ma démarche » et vérifie que la WebView navigue vers `expectedUrl` (navigation JS, pas de nouvelle fenêtre).
   * Le retour sur la liste est dans `SuiviDemarchesPage.retourJusquAPageSuivi()`. iOS : l'URL tentée n'est pas observable avec le domaine de test.
   */
  async assertLienExterne(expectedUrl: string, timeoutMs = DEMARCHE_DETAIL_TIMEOUT_MS): Promise<void> {
    await clickDisplayed(demarcheDetailLocators.detailExternalButton, { timeout: timeoutMs })

    let lastUrl: string | null = null
    try {
      await browser.waitUntil(
        async () => {
          lastUrl = await browser.getUrl()
          if (lastUrl.includes(expectedUrl)) return true
          // iOS passe par la racine de l'app, la cible encodée dans `?login_redirect_url=…`.
          return decodeURIComponentSafe(lastUrl).includes(expectedUrl)
        },
        {
          timeout: timeoutMs,
          interval: 500,
          timeoutMsg: `URL externe "${expectedUrl}" non atteinte après ${timeoutMs}ms`
        }
      )
    } catch {
      throw new AssertionError({ message: `URL externe "${expectedUrl}" non trouvée après clic sur "${demarcheDetailLocators.detailExternalButtonName}" (dernière URL observée : ${maskIdToken(lastUrl)})` })
    }
  }
}

export default traced(new DemarcheDetailPage(), 'DemarcheDetailPage')
