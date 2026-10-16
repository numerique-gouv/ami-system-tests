import AgendaPage from '../../pages/agenda.page'
import ZonesPage from '../../pages/zones.page'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {zonesLocators} from '../../pages/locators/zones.locators'

/**
 * Agenda : évènements à venir (vacances scolaires, jours fériés) et accès à la page des zones scolaires.
 * Lecture seule : « Supprimer » est vérifié mais jamais cliqué, les zones ne sont pas modifiées.
 */
describe('Agenda', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  before(async function () {
    await getAppToStartingState()
  })

  beforeEach(async function () {
    await getAppToStartingState()
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

  it('« Préférences » ouvre la page des 13 zones scolaires, puis « Retour » revient à l\'agenda', async () => {
    await AgendaPage.openZonePreferences()
    await ZonesPage.assertDisplayed()
    expect(Object.keys(await ZonesPage.zoneStates())).toEqual(zonesLocators.zoneNames)
    await ZonesPage.back()
    await AgendaPage.assertDisplayed()
  })
})
