import {getAppToLoggedOutState, loginWithFranceConnect, passOnboardingToHome} from '../../pages/authenticate.process'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import HomePage from '../../pages/home.page'
import {getTestUser} from '../../helpers/common/test-users'
import {step} from '@helpers/reporting/report'
import {platform} from '../../platform'
import {waitForNotificationAuthorization} from '../../helpers/mobile/ios-notifications'

/** Le flow FranceConnect complet aboutit sur la page d'accueil (l'authentification elle-même est l'affaire d'une autre équipe). */
describe('Authentification', function () {
  this.timeout(180000)
  before(async function () {
    step('Sélectionner l\'environnement de review et s\'assurer d\'être déconnecté')
    await getAppToLoggedOutState()
  })

  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getTestUser()

    step('1. Démarrer le flow FranceConnect (eIDAS faible)')
    await loginWithFranceConnect(user)

    step('2. Accepter la feuille native des notifications (iOS), passer la clé d\'accès, le choix des zones puis l\'onboarding')
    await passOnboardingToHome()
    await FranceConnectMirePage.tapFranceConnect(true )

    step('3. Vérifier l\'arrivée sur la page d\'accueil')
    await platform().inWebContext(() => HomePage.assertDisplayed(30000))

    // iOS : l'onboarding accepte les notifications, constaté dans le simulateur.
    if (driver.isIOS) {
      step('4. Vérifier que les notifications sont autorisées (réglage système du simulateur)')
      await waitForNotificationAuthorization('authorized')
    }
  })

})
