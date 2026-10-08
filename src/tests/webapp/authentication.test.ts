import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../pages/franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from '../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../pages/onboarding-zones.page'
import OnboardingNotificationsPage from '../../pages/onboarding-notifications.page'
import HomePage from '../../pages/home.page'
import {getUser} from '../../helpers/test-users'
import {step} from '@helpers/report'

/**
 * Vérifie que le flow FranceConnect complet aboutit sur la page d'accueil, en webapp.
 * L'authentification est sous la responsabilité d'une autre équipe — ce test valide uniquement
 * que notre intégration fonctionne de bout en bout.
 *
 * Pas de sélecteur d'environnement en webapp (cf. resolveEnvironment) : la session démarre
 * directement sur l'écran de connexion. Les écrans d'onboarding (clé d'accès, zones scolaires,
 * notifications) ne sont affichés qu'à certaines connexions — chacun est un no-op s'il est absent.
 */
describe('Authentification', () => {
  before(async function () {
    this.timeout(180000)
  })

  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    this.timeout(180000)
    const user = getUser('avec_nom_dusage')

    step('1. Démarrer le flow FranceConnect (eIDAS faible)')
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)

    step("2. Passer les écrans d'onboarding présents (clé d'accès, zones scolaires, notifications)")
    await OnboardingPasskeyPage.dismiss()
    await OnboardingZonesPage.dismiss()
    await OnboardingNotificationsPage.dismiss()

    step("3. Vérifier l'arrivée sur la page d'accueil")
    await HomePage.assertHomeVisible(30000)
    expect(await HomePage.greeting()).toMatch(/^Bonjour \S+/)
  })
})
