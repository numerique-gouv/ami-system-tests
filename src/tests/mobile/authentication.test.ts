import AllureReporter from '@wdio/allure-reporter'
import EnvironmentPickerPage from '../../pages/franceconnect/environment-picker.page'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../pages/franceconnect/franceconnect-credentials.page'
import PasskeyRegistrationPromptPage from '../../pages/passkey-registration-prompt.page'
import OnboardingNotificationsPage from '../../pages/onboarding-notifications.page'
import HomePage from '../../pages/home.page'
import {getUser} from '../../helpers/test-users'

/**
 * Vérifie que le flow FranceConnect complet aboutit sur la page d'accueil.
 * L'authentification est sous la responsabilité d'une autre équipe — ce test
 * valide uniquement que notre intégration fonctionne de bout en bout.
 */
describe('Authentification', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Authentification')
    await AllureReporter.addFeature('Authentification')
    await AllureReporter.addStory('Connexion via FranceConnect')
    await AllureReporter.addSeverity('critical')
    await AllureReporter.addTag('franceconnect')
  })
  
  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getUser('avec_nom_dusage')

    await AllureReporter.addStep('1. Sélectionner l\'environnement de review')
    await EnvironmentPickerPage.reviewEnvironmentPicker()

    await AllureReporter.addStep('2. Démarrer le flow FranceConnect (eIDAS faible)')
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)

    await AllureReporter.addStep('3. Passer la proposition de clé d\'accès puis l\'onboarding des notifications')
    await PasskeyRegistrationPromptPage.dismiss()
    await OnboardingNotificationsPage.dismiss()
    await FranceConnectMirePage.tapFranceConnect(true )

    await AllureReporter.addStep('4. Vérifier l\'arrivée sur la page d\'accueil')
    await HomePage.assertHomeVisible(30000)
  })

})
