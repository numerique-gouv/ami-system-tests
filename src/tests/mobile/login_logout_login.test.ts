import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import {step} from '@helpers/report'

describe('Profil usager — déconnexion suivie d\'une reconnexion', function () {
  this.timeout(300000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  // Deux connexions complètes et une déconnexion dans un seul `it` : de ~65 s (machine rapide) à ~125 s (machine lente),
  // donc à cheval sur le délai Mocha global de 120 s (campagne du 2026-10-15 : 0/4 sur Android, toujours par timeout).
  it('log out suivi d un log in', async function () {
    await getAppToStartingState()

    step('Taper Me déconnecter depuis le menu avatar')
    await ProfilePage.logout()
    // La déconnexion n'est finie qu'au retour sur l'écran de connexion (aller-retour de fin de session
    // FranceConnect) : on l'attend avant de relancer l'authentification.
    step('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
    step('Lancer le flow FranceConnect')
    await getAppToStartingState()
  })
})
