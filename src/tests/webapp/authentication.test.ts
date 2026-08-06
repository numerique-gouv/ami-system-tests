import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../../pages/login.page'
import FranceConnectPage from '../../pages/franceconnect.page'
import HomePage from '../../pages/home.page'
import {getUser} from '../../helpers/test-users'

/**
 * Pilote de la suite webapp : vérifie que le flow FranceConnect complet, rejoué dans un
 * navigateur classique sur la SPA servie en staging, aboutit sur la page d'accueil.
 * Valide en un seul run l'adaptateur de plateforme (src/platform/), la config
 * wdio.webapp.conf.ts et la résolution d'environnement (src/helpers/environment.ts).
 *
 * Contrairement à la version mobile (src/tests/mobile/authentication.test.ts), pas de picker
 * d'environnement natif ni d'onboarding notifications (écrans natifs, sans objet en webapp) —
 * ces étapes sont des no-op côté LoginPage/OnboardingNotificationsPage (cf. platform().kind).
 */
describe('Authentification', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addFeature('Authentification')
    await AllureReporter.addSeverity('critical')
  })

  it("s'authentifie via FranceConnect et arrive sur la page d'accueil", async function () {
    const user = getUser('avec_nom_dusage')

    await AllureReporter.addStep("1. Ouvrir la SPA — l'URL de la session (baseUrl) fait déjà office de sélection d'environnement")
    await browser.url('/')
    await LoginPage.reviewEnvironmentPicker() // no-op en webapp (cf. platform().kind), exercé ici pour non-régression

    await AllureReporter.addStep('2. Démarrer le flow FranceConnect (eIDAS faible)')
    await LoginPage.tapFranceConnect()
    if (!await FranceConnectPage.selectEidasFaible()) {
      await FranceConnectPage.fillCredentials(user)
    }

    await AllureReporter.addStep('3. Vérifier l\'arrivée sur la page d\'accueil')
    const homeReady = await HomePage.isHomeVisible(30000)
    expect(homeReady).toBe(true)
  })
})
