import AllureReporter from '@wdio/allure-reporter'
import ProfilePage from '@pages/profile.page'
import { getAppToStartingState } from '@pages/authenticate.process'

describe('Profil usager — déconnexion suivie d\'une reconnexion', () => {
  it.skip('log out suivi d un log in', async () => {
    await AllureReporter.addFeature('login, logout, login sans fausse route')
    await AllureReporter.addSeverity('critical')

    await getAppToStartingState()

    await AllureReporter.addStep('Taper Me déconnecter depuis le menu avatar')
    await ProfilePage.logout()
    await AllureReporter.addStep('Lancer le flow FranceConnect')
    await getAppToStartingState({grantConsent: false})
  })
})
