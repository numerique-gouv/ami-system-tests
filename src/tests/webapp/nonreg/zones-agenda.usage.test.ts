import AgendaPage from '../../../pages/agenda.page'
import PreferencesPage from '../../../pages/preferences.page'
import ZonesPage from '../../../pages/zones.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {step} from '../../../helpers/reporting/report'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Zones scolaires : les zones cochées déterminent les vacances affichées dans l'agenda. Les scénarios modifient les zones du compte : état d'origine
 * relevé dans `before()`, rétabli dans `after()`.
 */
describe('Non-régression — zones scolaires et agenda', function () {
  this.timeout(300000)

  let originalZones: Record<string, boolean> = {}

  async function openZones(): Promise<void> {
    await PreferencesPage.open()
    await PreferencesPage.openZones()
    await ZonesPage.assertDisplayed()
  }

  /** Coche la zone B puis cherche dans l'agenda une tuile qui la cite. Hors période de vacances affichée, aucune tuile ne cite les zones : le scénario est sauté. */
  async function zoneBTileOrSkip(context: Mocha.Context): Promise<string> {
    await openZones()
    await ZonesPage.setZone('Zone B', true)
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    for (const title of await AgendaPage.eventTitles()) {
      if ((await AgendaPage.eventText(title)).includes('Zone B')) return title
    }
    log.warn('ANOMALIE ? Aucune tuile de l’agenda ne cite « Zone B » : scénario des zones non applicable à cette date.')
    return context.skip()
  }

  before(async function () {
    await getAppToStartingState()
    await openZones()
    originalZones = await ZonesPage.zoneStates()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  after(async function () {
    await openZones()
    await ZonesPage.restoreZones(originalZones)
  })

  it('retirer la zone B se reflète dans les préférences et dans l’agenda, la remettre aussi', async function () {
    step('1. La zone B est cochée : repérer une tuile de l’agenda qui la cite')
    const zoneTile = await zoneBTileOrSkip(this)
    expect(await AgendaPage.eventText(zoneTile)).toContain('Zone B')

    step('2. Décocher « Zone B » : elle est décochée en revenant sur l’écran')
    await openZones()
    await ZonesPage.setZone('Zone B', false)
    await NavigationPage.goToRoute('/')
    await HomePage.assertDisplayed()
    await openZones()
    expect((await ZonesPage.zoneStates())['Zone B']).toBe(false)

    step('3. La tuile ne cite plus « Zone B » mais cite toujours une autre zone')
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    const text = await AgendaPage.eventText(zoneTile)
    expect(text).not.toContain('Zone B')
    expect(text).toMatch(/Zone [AC]|Corse/)

    step('4. Recocher « Zone B » : la tuile la cite de nouveau')
    await openZones()
    await ZonesPage.setZone('Zone B', true)
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.eventText(zoneTile)).toContain('Zone B')
  })

  it('aucune zone cochée : les vacances qui les citaient disparaissent de l’agenda', async function () {
    step('1. La zone B est cochée : repérer une tuile de l’agenda qui la cite')
    const zoneTile = await zoneBTileOrSkip(this)

    step('2. Décocher toutes les zones')
    await openZones()
    for (const zone of Object.keys(await ZonesPage.zoneStates())) await ZonesPage.setZone(zone, false)

    step('3. La tuile n’est plus dans l’agenda')
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.isEventListed(zoneTile, 4000)).toBe(false)
  })
})
