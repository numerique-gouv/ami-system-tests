import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../pages/home.page'
import ProfilePage from '@pages/avatar-menu.page'
import { authenticate } from '@helpers/authenticate'

describe('Profil usager — déconnexion suivie d\'une reconnexion', () => {
  it.skip('log out suivi d un log in', async () => {
    await AllureReporter.addFeature('login, logout, login sans fausse route')
    await AllureReporter.addSeverity('critical')

    if (!await HomePage.isHomeReachable(1000)) {
      console.warn("You are not home, let's authenticate")
      await authenticate()
    } else console.warn("You are home, and laready authenticated")

    await AllureReporter.addStep('Taper Me déconnecter depuis le menu avatar')
    await ProfilePage.logout()
    await AllureReporter.addStep('Lancer le flow FranceConnect')
    await authenticate(true)
  })
})
