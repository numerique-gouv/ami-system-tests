import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../../pages/home.page'
import NavigationPage from '../../pages/navigation.page'
import ServicesPage from '../../pages/services.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Accueil : salutation, blocs « Mon agenda » et « Mes démarches », cloche, carrousel de raccourcis.
 * Lecture seule : les cartes ouvrent leur destination mais rien n'est enregistré.
 */
describe('Accueil', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Accueil')
    await AllureReporter.addFeature('Accueil')
    await AllureReporter.addSeverity('critical')
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
  })

  it('affiche la salutation, la date et les blocs agenda et démarches', async () => {
    await HomePage.assertContentVisible()
    expect(await HomePage.greeting()).toMatch(/^Bonjour \S+/)
    await HomePage.assertDateVisible()
  })

  it('la cloche ouvre les notifications', async () => {
    await HomePage.openNotificationsBell()
    await NavigationPage.waitForHash(/#\/notifications$/)
    await NavigationPage.waitForHeading('Notifications')
  })

  it('« Voir tous mes évènements » ouvre l\'agenda', async () => {
    await HomePage.openAllEvents()
    await NavigationPage.waitForHash(/#\/agenda$/)
    await NavigationPage.waitForHeading('Mon agenda')
  })

  it('« Voir toutes mes démarches » ouvre le suivi', async () => {
    await HomePage.openAllProcedures()
    await NavigationPage.waitForHash(/#\/followup$/)
    await NavigationPage.waitForHeading('Mes démarches')
  })

  it('la carte « Opération Tranquillité Vacances » ouvre la fiche du service', async () => {
    await HomePage.openOtvCard()
    await NavigationPage.waitForHash(/#\/services\/service\/psl\/OperationTranquilliteVacances$/)
    await ServicesPage.assertBenefitButtonOffered()
  })

  it('la carte « Renseignez votre adresse » ouvre le formulaire d\'adresse sans rien enregistrer', async () => {
    await HomePage.openAddressCard()
    await NavigationPage.waitForHash(/#\/edit-address$/)
    await NavigationPage.waitForHeading(/Où habitez-vous/)
  })
})
