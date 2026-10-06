import AllureReporter from '@wdio/allure-reporter'
import EnvironmentPickerPage from '../../pages/franceconnect/environment-picker.page'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../pages/franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from '../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../pages/onboarding-zones.page'
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
    // Une session FranceConnect encore ouverte dans le simulateur/émulateur (run précédent, SSO) renvoie
    // directement vers l'app sans afficher la mire eIDAS : observé 2026-10-06 sur iOS, la capture de l'échec
    // montrait déjà l'onboarding des notifications. On ne saisit alors ni eIDAS ni identifiants.
    const fcDemandeIdentifiants = await browser.waitUntil(
      () => FranceConnectEidasPage.isEidasVisible(), {timeout: 15000, interval: 500}
    ).then(() => true).catch(() => false)
    if (fcDemandeIdentifiants) {
      await FranceConnectEidasPage.selectEidasFaible()
      await FranceConnectCredentialsPage.fillCredentials(user)
    } else {
      await AllureReporter.addStep('(session FranceConnect déjà ouverte : eIDAS et identifiants non demandés)')
    }

    await AllureReporter.addStep('3. Passer la proposition de clé d\'accès, le choix des zones puis l\'onboarding des notifications')
    await OnboardingPasskeyPage.dismiss()
    await OnboardingZonesPage.dismiss()
    await OnboardingNotificationsPage.dismiss()
    await FranceConnectMirePage.tapFranceConnect(true )

    await AllureReporter.addStep('4. Vérifier l\'arrivée sur la page d\'accueil')
    await HomePage.assertHomeVisible(30000)
  })

})
