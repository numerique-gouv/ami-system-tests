import AllureReporter from '@wdio/allure-reporter'
import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'

describe('Profil usager — déconnexion suivie d\'une reconnexion', () => {
  it('log out suivi d un log in', async () => {
    await AllureReporter.addFeature('login, logout, login sans fausse route')
    await AllureReporter.addSeverity('critical')

    await getAppToStartingState()

    await AllureReporter.addStep('Taper Me déconnecter depuis le menu avatar')
    await ProfilePage.logout()
    // La déconnexion n'est finie qu'au retour sur l'écran de connexion (aller-retour de fin de session
    // FranceConnect) : on l'attend avant de relancer l'authentification.
    await AllureReporter.addStep('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
    await AllureReporter.addStep('Lancer le flow FranceConnect')
    await getAppToStartingState({grantConsent: false})
  })
})
