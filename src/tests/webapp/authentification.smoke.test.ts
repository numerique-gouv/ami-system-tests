import {getAppToLoggedOutState, loginWithFranceConnect, passOnboardingToHome} from '../../pages/authenticate.process'
import HomePage from '../../pages/home.page'
import {getTestUser} from '../../helpers/common/test-users'
import {step} from '@helpers/reporting/report'

/**
 * Le flow FranceConnect complet aboutit sur la page d'accueil (l'authentification elle-même est l'affaire d'une autre équipe).
 * Pas de sélecteur d'environnement en webapp ; les écrans d'onboarding ne s'affichent qu'à certaines connexions.
 */
describe('Authentification', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  before(async function () {
    step('S\'assurer d\'être déconnecté')
    await getAppToLoggedOutState()
  })

  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getTestUser()

    step('1. Démarrer le flow FranceConnect (eIDAS faible)')
    await loginWithFranceConnect(user)

    step("2. Passer les écrans d'onboarding présents (clé d'accès, zones scolaires, notifications)")
    await passOnboardingToHome()

    step("3. Vérifier l'arrivée sur la page d'accueil")
    await HomePage.assertDisplayed(30000)
    expect(await HomePage.greeting()).toMatch(/^Bonjour \S+/)
  })
})
