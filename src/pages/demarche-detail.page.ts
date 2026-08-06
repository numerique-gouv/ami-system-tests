import { tl, retourJusquATexteVisible } from '../helpers/webview'
import { platform } from '../platform'
import { traced } from '../helpers/traced'
import { getDemarcheDetailLocators } from './locators/demarche-detail.locators'
import {AssertionError} from "node:assert";

const DEMARCHE_DETAIL_TIMEOUT_MS = 20000

class DemarcheDetailPage {
  /**
   * Depuis la page de détail (atteinte via `DemarchesPage.ouvreDemarche()`), clique "Accéder à
   * ma démarche" et vérifie que la WebView navigue vers `expectedUrl` (navigation JS qui
   * remplace l'URL courante, pas de nouvelle fenêtre). Revient ensuite sur la liste via la
   * navigation native de l'app (bouton "Retour à la page précédente" de la page de détail, PUIS
   * bouton "Retour" de la nav) pour laisser l'app dans un état propre entre les tests.
   *
   * findByRole (pas getByRole) sert de sentinelle d'arrivée sur la page de détail : le clic de
   * `ouvreDemarche()` vient de déclencher une navigation SPA, le bouton n'existe pas forcément
   * déjà dans le DOM au moment de l'appel — getByRole échoue immédiatement sans réessayer,
   * findByRole poll jusqu'à `timeout`. Cette sentinelle appartenait auparavant à `ouvreDemarche`
   * (DemarchesPage) ; elle est ici car c'est cette méthode qui utilise le bouton.
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

      let externalButton
      try {
        externalButton = await tl().findByRole('button', { name: loc.detailExternalButtonName }, { timeout: timeoutMs })
      } catch {
        throw new AssertionError({ message: `Bouton "${loc.detailExternalButtonName}" absent après ${timeoutMs}ms` })
      }
      await externalButton.click()

      let lastUrl: string | null = null
      try {
        await browser.waitUntil(
          async () => {
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
    })
  }
}

export default traced(new DemarcheDetailPage(), 'DemarcheDetailPage')
