import AgendaPage from '../../../pages/agenda.page'
import PreferencesPage from '../../../pages/preferences.page'
import ZonesPage from '../../../pages/zones.page'
import ProfilePage from '../../../pages/profile.page'
import NavigationPage from '../../../pages/navigation.page'
import DemarcheDetailPage from '../../../pages/demarche-detail.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {PARTNER_AMI, grantDemarchesConsent, publishDemarche} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Zones scolaires et agenda (plan : zones-agenda.md, scénarios S7, S8, S10). Réunion du 2026-10-06, 01:40–03:08 et 12:46–14:43.
 *
 * S7 MODIFIE les zones scolaires du compte `avec_nom_dusage` : état d'origine relevé dans `before()`, rétabli dans `after()`.
 * S8 et S10 créent leurs propres démarches (titre horodaté) : rien à restaurer — la suppression d'un élément de l'agenda est
 * définitive pour l'usager (réunion, 13:17–13:36), d'où l'élément créé par le test.
 */
describe('Non-régression — zones scolaires et agenda', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(300000)

  const user = getUser('avec_nom_dusage')
  let originalZones: Record<string, boolean> = {}

  async function openZones(): Promise<void> {
    await PreferencesPage.open()
    await PreferencesPage.openZones()
    await ZonesPage.assertDisplayed()
  }

  /** Échéance dans 30 jours : visible dans « Prochainement » / « Les mois suivants » quelle que soit la date d'exécution. */
  const inThirtyDays = (): string => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()

  /** Publie une démarche avec échéance (entrée d'agenda) et retourne son titre et sa référence. */
  async function publishDemarcheWithMilestone(label: string): Promise<{title: string; itemId: string}> {
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    const itemId = `E2E-${new Date().toISOString()}`
    const title = `Demarche E2E ${itemId} ${label}`
    await publishDemarche({
      title, body: `Démarche avec échéance (${label})`, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'wip', milestoneStartDate: inThirtyDays(),
    })
    return {title, itemId}
  }

  /** L'agenda ne se met à jour qu'au chargement : on le recharge jusqu'à voir l'élément. */
  async function waitForAgendaEvent(title: string): Promise<void> {
    await browser.waitUntil(async () => {
      await NavigationPage.reload()
      return await AgendaPage.isEventListed(title, 4000)
    }, {timeout: 40000, interval: 1000, timeoutMsg: `L'élément « ${title} » n'est pas apparu dans l'agenda après 40000ms`})
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
    await getAppToStartingState()
    await openZones()
    await ZonesPage.restoreZones(originalZones)
  })

  it('S7 — retirer la zone B se reflète dans les préférences et dans l’agenda, la remettre aussi', async function () {
    step('1. La zone B est cochée : repérer une tuile de l’agenda qui la cite')
    await openZones()
    await ZonesPage.setZone('Zone B', true)
    // La page Zones n'a pas de barre de navigation basse : on rejoint l'Agenda par sa route.
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    let zoneTile: string | undefined
    for (const title of await AgendaPage.eventTitles()) {
      if ((await AgendaPage.eventText(title)).includes('Zone B')) { zoneTile = title; break }
    }
    if (!zoneTile) {
      // Hors période de vacances scolaires affichée, aucune tuile ne cite les zones : rien à vérifier.
      log.warn('ANOMALIE ? Aucune tuile de l’agenda ne cite « Zone B » : scénario S7 non applicable à cette date.')
      this.skip()
    }
    expect(await AgendaPage.eventText(zoneTile)).toContain('Zone B')

    step('2. Décocher « Zone B » : elle est décochée après rechargement')
    await openZones()
    await ZonesPage.setZone('Zone B', false)
    await NavigationPage.reload()
    expect((await ZonesPage.zoneStates())['Zone B']).toBe(false)

    step('3. La tuile ne cite plus « Zone B » mais cite toujours une autre zone')
    // La page Zones n'a pas de barre de navigation basse : on rejoint l'Agenda par sa route.
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    const text = await AgendaPage.eventText(zoneTile)
    expect(text).not.toContain('Zone B')
    expect(text).toMatch(/Zone [AC]|Corse/)

    step('4. Recocher « Zone B » : la tuile la cite de nouveau')
    await openZones()
    await ZonesPage.setZone('Zone B', true)
    // La page Zones n'a pas de barre de navigation basse : on rejoint l'Agenda par sa route.
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.eventText(zoneTile)).toContain('Zone B')
  })

  it('S8 — une démarche avec échéance apparaît dans l’agenda et son titre mène au détail de cette démarche', async function () {
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

  it('S10 — un élément supprimé de l’agenda disparaît et ne revient pas au rechargement', async function () {
    step('1. Publier une démarche avec échéance et la retrouver dans l’agenda')
    const {title} = await publishDemarcheWithMilestone('suppression')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    await waitForAgendaEvent(title)

    step('2. La supprimer')
    await AgendaPage.deleteEvent(title)

    step('3. Elle reste absente après rechargement')
    await NavigationPage.reload()
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.isEventListed(title, 4000)).toBe(false)
  })

  it('S10.2 — une reconnexion fait réapparaître un élément fixe supprimé de l’agenda', async function () {
    step('1. Repérer un élément fixe : un jour férié de préférence, à défaut n’importe quel élément qui n’est pas une démarche de test')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    // Élément fixe = tout sauf les démarches créées par ces specs (« Demarche E2E … »). Un jour férié est préféré : stable et
    // indépendant des zones. Staging n'en a pas (un seul élément, « Vacances de la Toussaint », relevé le 2026-10-15).
    const fixed = (await AgendaPage.eventTitles()).filter(title => !title.startsWith('Demarche E2E'))
    const holiday = fixed.find(title => !title.startsWith('Vacances')) ?? fixed[0]
    if (!holiday) throw new Error('Aucun élément fixe dans l’agenda : impossible de vérifier S10.2')

    step(`2. Supprimer « ${holiday} » : il est absent après rechargement`)
    await AgendaPage.deleteEvent(holiday)
    await NavigationPage.reload()
    await AgendaPage.assertDisplayed()
    expect(await AgendaPage.isEventListed(holiday, 3000)).toBe(false)

    step('3. Se déconnecter puis se reconnecter')
    await ProfilePage.logout()
    await getAppToStartingState()

    step('4. L’élément fixe est de nouveau dans l’agenda')
    await AgendaPage.open()
    await AgendaPage.assertDisplayed()
    // Réapparition constatée en préprod le 2026-10-15 ; une démarche avec échéance supprimée réapparaît aussi, mais la réunion ne
    // l'affirme pas (« pas ses rendez-vous », 14:04) : elle n'est pas assertée ici.
    expect(await AgendaPage.isEventListed(holiday, 10000)).toBe(true)
  })
})
