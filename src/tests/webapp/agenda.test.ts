import AgendaPage from '../../pages/agenda.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Agenda : évènements à venir (vacances scolaires, jours fériés) et sélecteur de zones scolaires.
 * Lecture seule : « Supprimer » est vérifié mais jamais cliqué, les zones ne sont pas modifiées.
 */
describe('Agenda', () => {
  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
    await AgendaPage.open()
  })

  it('liste les évènements à venir puis ceux des mois suivants', async () => {
    await AgendaPage.assertSectionsVisible()
    expect(await AgendaPage.countEvents()).toBeGreaterThan(0)
  })

  it('ouvre le dialogue d\'un évènement qui propose « Supprimer », puis le ferme', async () => {
    await AgendaPage.openFirstEvent()
    await AgendaPage.assertDeleteActionOffered()
    await AgendaPage.closeEventDialog()
  })

  it('« Préférences » ouvre le sélecteur des 13 zones scolaires, puis se ferme', async () => {
    await AgendaPage.openZonePreferences()
    const zones = Object.keys(await AgendaPage.zoneStates())
    expect(zones).toEqual(expect.arrayContaining(['Zone A', 'Zone B', 'Zone C', 'Corse', 'Réunion', 'Wallis et Futuna']))
    await AgendaPage.closeZonePreferences()
  })
})
