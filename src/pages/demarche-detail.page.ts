import { platform } from '../platform'
import { traced } from '@helpers/traced'
import { getDemarcheDetailLocators } from '@locators/demarche-detail.locators'
import {AssertionError} from "node:assert";
import {pageText, waitForPageText, findRole} from '@helpers/spa'

const DEMARCHE_DETAIL_TIMEOUT_MS = 20000

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

/** L'URL du lien externe peut porter un `id_token` (SSO) : jamais dans les logs ni dans Allure. */
function maskIdToken(url: string | null): string | null {
  return url?.replace(/(id_token=)[^&#]*/g, '$1***') ?? url
}

class DemarcheDetailPage {
  /**
   * Vérifie l'arrivée sur le détail d'une démarche. Le titre est dynamique (propre à chaque démarche) :
   * il est passé en argument. « référence dossier » n'existe que sur la page de détail, le titre
   * seul étant aussi dans la liste du Suivi qui reste affichée un instant après le clic.
   */
  async assertDisplayed(title: string): Promise<void> {
    await waitForPageText('référence dossier')
    await waitForPageText(title)
  }

  /**
   * Vérifie le contenu du détail (`/#/followup/item/…`) : statut, titre, partenaire, référence
   * dossier et historique chronologique des messages — sans quitter la SPA (contrairement à
   * `assertLienExterne`, qui suit le lien partenaire). Chaque notification publiée avec cet
   * `itemId` ajoute une ligne à l'historique.
   */
  async assertDetail(expected: {title: string; statusLabel: string; reference: string; messages: string[]}): Promise<void> {
    // Sentinelle propre au détail : le titre de la démarche est aussi dans la liste du Suivi, qui reste
    // affichée un instant après le clic — « référence dossier » n'existe que sur la page de détail.
    await waitForPageText('référence dossier')
    const text = await pageText()
    for (const part of [expected.statusLabel.toUpperCase(), expected.title, 'AMI', `référence dossier : ${expected.reference}`, 'Messages', ...expected.messages]) {
      if (!text.includes(part))
        throw new AssertionError({message: `Détail de la démarche : "${part}" absent (texte : ${text.slice(0, 400)})`})
    }
    // Ordre chronologique de l'historique : chaque message vient après le précédent.
    const positions = expected.messages.map(m => text.indexOf(m))
    if (positions.some((p, i) => i > 0 && p < positions[i - 1]))
      throw new AssertionError({message: `Historique dans le désordre : ${expected.messages.join(' → ')} (positions ${positions.join(', ')})`})
  }

  /**
   * Depuis la page de détail (atteinte via `DemarchesPage.ouvreDemarche()`), clique "Accéder à
   * ma démarche" et vérifie que la WebView navigue vers `expectedUrl` (navigation JS qui
   * remplace l'URL courante, pas de nouvelle fenêtre). Revient ensuite sur la liste via la
   * navigation native de l'app (bouton "Retour à la page précédente" de la page de détail, PUIS
   * bouton "Retour" de la nav) pour laisser l'app dans un état propre entre les tests.
   *
   * `findRole` attend le bouton : le clic de `ouvreDemarche()` vient de déclencher une navigation SPA,
   * il n'existe pas forcément déjà dans le DOM au moment de l'appel. C'est cette méthode qui utilise
   * le bouton, c'est donc elle qui vérifie son arrivée sur la page de détail.
   *
   * `browser.back()` (une seule fois) ramène de `chrome-error://chromewebdata` (le domaine
   * partenaire `.example`, RFC 2606, ne résout jamais) à la page de détail de l'app. Le retour
   * liste se fait ensuite via le bouton de retour propre à la page de détail — la nav basse
   * (onglets Accueil/Agenda/Services/Suivi) n'existe PAS sur cet écran (confirmé en live :
   * seul un `<nav>` avec le bouton retour y est présent), contrairement à la home.
   *
   * Un seul `platform().inWebContext()` pour tout le cycle sentinelle → clic → vérif URL → retour.
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
  async assertLienExterne(expectedUrl: string, timeoutMs = DEMARCHE_DETAIL_TIMEOUT_MS): Promise<void> {
    const loc = getDemarcheDetailLocators()
    await platform().inWebContext(async () => {
      try {
        let externalButton = await findRole('button', loc.detailExternalButtonName, { timeout: timeoutMs })
        await externalButton.click()
      } catch {
        throw new AssertionError({ message: `Bouton "${loc.detailExternalButtonName}" absent après ${timeoutMs}ms` })
      }

      let lastUrl: string | null = null
      try {
        await browser.waitUntil(
          async () => {
            lastUrl = await browser.getUrl()
            // iOS (observé 2026-10-06) : le lien passe par la racine de l'app, la cible étant encodée dans
            // `?login_redirect_url=…` (Android atterrit directement sur l'URL en clair).
            return lastUrl.includes(expectedUrl) || decodeURIComponentSafe(lastUrl).includes(expectedUrl)
          },
          {
            timeout: timeoutMs,
            interval: 500,
            timeoutMsg: `URL externe "${expectedUrl}" non atteinte après ${timeoutMs}ms`
          }
        )
      } catch {
        throw new AssertionError({ message: `URL externe "${expectedUrl}" non trouvée après clic sur "${loc.detailExternalButtonName}" (dernière URL observée : ${maskIdToken(lastUrl)})` })
      }
    })
  }
}

export default traced(new DemarcheDetailPage(), 'DemarcheDetailPage')
