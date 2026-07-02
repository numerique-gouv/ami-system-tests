import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import { getUser } from '../helpers/test-users'

/**
 * Vérifie que le flow FranceConnect complet aboutit sur la page d'accueil.
 * L'authentification est sous la responsabilité d'une autre équipe — ce test
 * valide uniquement que notre intégration fonctionne de bout en bout.
 */
describe('Authentification', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addFeature('Authentification')
    await AllureReporter.addSeverity('critical')
  })
  
  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getUser('avec_nom_dusage')

    await AllureReporter.addStep('1. Sélectionner l\'environnement de review')
    await LoginPage.reviewEnvironmentPicker()

    await AllureReporter.addStep('2. Démarrer le flow FranceConnect (eIDAS faible)')
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox(user)

    await AllureReporter.addStep('3. Passer l\'onboarding des notifications')
    await OnboardingNotificationsPage.dismiss()

    await AllureReporter.addStep('4. Vérifier l\'arrivée sur la page d\'accueil')
    const homeReady = await HomePage.isHomeVisible(60000)
    expect(homeReady).toBe(true)
  })

})
