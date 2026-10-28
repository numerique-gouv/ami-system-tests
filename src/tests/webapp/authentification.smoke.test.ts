import {passOnboardingToHome} from '../../pages/authenticate.process'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../pages/franceconnect/franceconnect-credentials.page'
import HomePage from '../../pages/home.page'
import {getTestUser} from '../../helpers/common/test-users'
import {step} from '@helpers/reporting/report'

/**
 * Vérifie que le flow FranceConnect complet aboutit sur la page d'accueil, en webapp.
 * L'authentification est sous la responsabilité d'une autre équipe — ce test valide uniquement
 * que notre intégration fonctionne de bout en bout.
 *
 * Pas de sélecteur d'environnement en webapp (cf. resolveEnvironment) : la session démarre
 * directement sur l'écran de connexion. Les écrans d'onboarding (clé d'accès, zones scolaires,
 * notifications) ne sont affichés qu'à certaines connexions — chacun est un no-op s'il est absent.
 */
describe('Authentification', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  before(async function () {
  })

  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getTestUser()

    step('1. Démarrer le flow FranceConnect (eIDAS faible)')
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)

    step("2. Passer les écrans d'onboarding présents (clé d'accès, zones scolaires, notifications)")
    // Attend le PREMIER écran parmi {accueil, passkey, zones, notifications} (geo.api.gouv.fr lent), le traite, et recommence jusqu'à l'accueil.
    await passOnboardingToHome()

    step("3. Vérifier l'arrivée sur la page d'accueil")
    await HomePage.assertHomeVisible(30000)
    expect(await HomePage.greeting()).toMatch(/^Bonjour \S+/)
  })
})
