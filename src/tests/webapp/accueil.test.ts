import HomePage from '../../pages/home.page'
import AgendaPage from '../../pages/agenda.page'
import NotificationsInboxPage from '../../pages/notifications.page'
import ProfilePage from '../../pages/profile.page'
import ServicesPage from '../../pages/services.page'
import SuiviDemarchesPage from '../../pages/suivi-demarches.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Accueil : salutation, blocs « Mon agenda » et « Mes démarches », cloche, carrousel de raccourcis.
 * Lecture seule : les cartes ouvrent leur destination mais rien n'est enregistré.
 */
describe('Accueil', () => {
  before(async function () {
    this.timeout(180000)
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
    await NotificationsInboxPage.assertDisplayed()
  })

  it('« Voir tous mes évènements » ouvre l\'agenda', async () => {
    await HomePage.openAllEvents()
    await AgendaPage.assertDisplayed()
  })

  it('« Voir toutes mes démarches » ouvre le suivi', async () => {
    await HomePage.openAllProcedures()
    await SuiviDemarchesPage.assertDisplayed()
  })

  it('la carte « Opération Tranquillité Vacances » ouvre la fiche du service', async () => {
    await HomePage.openOtvCard()
    await ServicesPage.assertBenefitButtonOffered()
  })

  it('la carte « Renseignez votre adresse » ouvre le formulaire d\'adresse sans rien enregistrer', async () => {
    await HomePage.openAddressCard()
    await ProfilePage.assertAddressFormDisplayed()
  })
})
