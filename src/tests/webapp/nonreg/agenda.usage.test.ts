import AgendaPage from '../../../pages/agenda.page'
import ProfilePage from '../../../pages/profile.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import DemarcheDetailPage from '../../../pages/demarche-detail.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {PARTNER_AMI, grantDemarchesConsent, publishDemarche} from '../../../helpers/partner-api'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'
/**
 * Éléments de l'agenda. Chaque scénario crée ses propres démarches (titre horodaté) : la suppression d'un élément de l'agenda est définitive pour l'usager.
 */
describe('Non-régression — agenda', function () {
  this.timeout(300000)

  const user = getTestUser()

  /** Échéance dans 30 jours : visible dans « Prochainement » / « Les mois suivants » quelle que soit la date d'exécution. */
  const inThirtyDays = (): string => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

  /** Publie une démarche avec échéance (entrée d'agenda) et retourne son titre et sa référence. */
  async function publishDemarcheWithMilestone(label: string): Promise<{title: string; itemId: string}> {
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    const itemId = `E2E-agenda-${Date.now()}`
    const title = `Demarche E2E ${itemId} ${label}`
    await publishDemarche({
      title, body: `Démarche avec échéance (${label})`, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'wip', milestoneStartDate: inThirtyDays(),
    })
    return {title, itemId}
  }

  /** L'agenda ne se met à jour qu'au chargement : on sort de l'Agenda et on y revient (la SPA relit le serveur à l'entrée) jusqu'à voir l'élément. */
  async function waitForAgendaEvent(title: string): Promise<void> {
    await browser.waitUntil(async () => {
      await NavigationPage.goToRoute('/')
      await HomePage.assertDisplayed()
      await AgendaPage.open()
      return await AgendaPage.isEventListed(title, 4000)
    }, {timeout: 40000, interval: 1000, timeoutMsg: `L'élément « ${title} » n'est pas apparu dans l'agenda après 40000ms`})
  }

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('une démarche avec échéance apparaît dans l’agenda et son titre mène au détail de cette démarche', async function () {
    step('1. Publier une démarche avec échéance')
    const {title, itemId} = await publishDemarcheWithMilestone('agenda')

    step('2. Elle apparaît dans l’agenda')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    await waitForAgendaEvent(title)

    step('3. Son titre ouvre le détail de cette démarche, avec sa référence')
    await AgendaPage.openEventTitle(title)
    await DemarcheDetailPage.assertDisplayed(title)
    await DemarcheDetailPage.assertReference(itemId)
  })

  it('un élément supprimé de l’agenda disparaît et ne revient pas en revenant sur l’agenda', async function () {
    step('1. Publier une démarche avec échéance et la retrouver dans l’agenda')
    const {title} = await publishDemarcheWithMilestone('suppression')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    await waitForAgendaEvent(title)

    step('2. La supprimer')
    await AgendaPage.deleteEvent(title)

    step('3. Elle reste absente en revenant sur l’agenda')
    await NavigationPage.goToTab('Accueil')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.isEventListed(title, 4000)).toBe(false)
  })

  it('une reconnexion fait réapparaître un élément fixe supprimé de l’agenda', async function () {
    step('1. Repérer un élément fixe : un jour férié de préférence, à défaut n’importe quel élément qui n’est pas une démarche de test')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    // Élément fixe = tout sauf les démarches créées par ces specs (« Demarche E2E … »), de préférence un jour férié, indépendant des zones.
    const fixed = (await AgendaPage.eventTitles()).filter(title => !title.startsWith('Demarche E2E'))
    const holiday = fixed.find(title => !title.startsWith('Vacances')) ?? fixed[0]
    if (!holiday) throw new Error('Aucun élément fixe dans l’agenda : impossible de vérifier la réapparition à la reconnexion')

    step(`2. Supprimer « ${holiday} » : il est absent en revenant sur l’agenda`)
    await AgendaPage.deleteEvent(holiday)
    await NavigationPage.goToTab('Accueil')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.isEventListed(holiday, 3000)).toBe(false)

    step('3. Se déconnecter puis se reconnecter')
    await ProfilePage.logout()
    await getAppToStartingState()

    step('4. L’élément fixe est de nouveau dans l’agenda')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    // Seule la réapparition d'un élément fixe est assertée : celle d'une démarche avec échéance supprimée n'est pas établie.
    expect(await AgendaPage.isEventListed(holiday, 10000)).toBe(true)
  })
})
