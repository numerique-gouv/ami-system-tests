import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import {step} from '@helpers/report'

describe('Profil usager — déconnexion suivie d\'une reconnexion', () => {
  it('log out suivi d un log in', async () => {

    await getAppToStartingState()

    step('Taper Me déconnecter depuis le menu avatar')
    await ProfilePage.logout()
    // La déconnexion n'est finie qu'au retour sur l'écran de connexion (aller-retour de fin de session
    // FranceConnect) : on l'attend avant de relancer l'authentification.
    step('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
    step('Lancer le flow FranceConnect')
    await getAppToStartingState({grantConsent: false})
  })
})
