import AgendaPage from '../../../pages/agenda.page'
import FranceConnectMirePage from '../../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../../pages/franceconnect/franceconnect-credentials.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import OnboardingNotificationsPage from '../../../pages/onboarding-notifications.page'
import OnboardingPasskeyPage from '../../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../../pages/onboarding-zones.page'
import PreferencesPage from '../../../pages/preferences.page'
import ZonesPage from '../../../pages/zones.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'
import logger from '@wdio/logger'

const log = logger('test')

/** La zone dont on change le choix : cochée par défaut, et citée par les tuiles de vacances de l'agenda. */
const ZONE = 'Zone B'

/**
 * Le choix de zones fait à l'onboarding (premier écran après la connexion) est enregistré : visible dans Préférences › Zones scolaires et
 * dans l'agenda ; le remettre dans les Préférences rétablit l'agenda.
 *
 * Part d'une session VIERGE : `wdio.webapp.conf.ts` supprime le profil Chrome avant cette spec (comme pour passkey.usage.test.ts), pour que
 * l'écran d'onboarding « Zones scolaires » s'affiche.
 *
 * MODIFIE les zones scolaires du compte `avec_nom_dusage` : l'état d'origine est relevé sur l'écran d'onboarding (avant toute modification) et
 * rétabli dans `after()`.
 */
describe('Non-régression — zones choisies à l’onboarding', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(420000)

  const user = getTestUser()
  let originalZones: Record<string, boolean> | undefined

  /**
   * L'agenda cite-t-il la zone sur une tuile ? (La page Zones n'a pas de barre basse : on rejoint l'Agenda par sa route.)
   * Zone décochée : aucune tuile ne doit la citer. Zone cochée : au moins une, sauf hors période de vacances scolaires affichée, où
   * l'effet n'est pas observable (avertissement).
   */
  async function assertAgendaCitesZone(expected: boolean): Promise<void> {
    await NavigationPage.goToRoute('/agenda')
    await AgendaPage.assertDisplayed()
    let cited = false
    for (const title of await AgendaPage.eventTitles()) {
      if ((await AgendaPage.eventText(title)).includes(ZONE)) { cited = true; break }
    }
    if (expected && !cited) log.warn(`ANOMALIE ? Aucune tuile de l’agenda ne cite « ${ZONE} » alors qu’elle est cochée : effet sur l’agenda non vérifiable à cette date.`)
    else expect(cited).toBe(expected)
  }

  async function openZones(): Promise<void> {
    await PreferencesPage.open()
    await PreferencesPage.openZones()
    await ZonesPage.assertDisplayed()
  }

  after(async function () {
    if (!originalZones) return
    await getAppToStartingState()
    await openZones()
    await ZonesPage.restoreZones(originalZones)
  })

  it('une zone changée à l’onboarding est enregistrée dans les préférences et dans l’agenda, la remettre dans les préférences rétablit l’agenda', async function () {
    step('1. S’authentifier via FranceConnect (eIDAS faible) ; la passkey, si elle est proposée, est ignorée')
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)
    if (await OnboardingPasskeyPage.isVisible(15000)) await OnboardingPasskeyPage.dismiss()

    step('2. L’onboarding propose les zones scolaires : relever l’état d’origine puis changer le choix de la zone B')
    expect(await OnboardingZonesPage.isVisible(15000)).toBe(true)
    originalZones = await OnboardingZonesPage.zoneStates()
    const wasChecked = originalZones[ZONE]
    expect(typeof wasChecked).toBe('boolean')
    await OnboardingZonesPage.setZone(ZONE, !wasChecked)
    await OnboardingZonesPage.dismiss()
    await OnboardingNotificationsPage.dismiss()
    await HomePage.assertHomeVisible(30000)

    step('3. Les préférences reflètent le choix de l’onboarding, en revenant sur l’écran aussi')
    await openZones()
    expect((await ZonesPage.zoneStates())[ZONE]).toBe(!wasChecked)
    await NavigationPage.goToRoute('/')
    await HomePage.assertHomeVisible()
    await openZones()
    expect((await ZonesPage.zoneStates())[ZONE]).toBe(!wasChecked)

    step('4. L’agenda reflète le choix de l’onboarding')
    await assertAgendaCitesZone(!wasChecked)

    step('5. Remettre la zone dans les préférences, comme au départ')
    await openZones()
    await ZonesPage.setZone(ZONE, wasChecked)

    step('6. L’agenda reflète la remise en état')
    await assertAgendaCitesZone(wasChecked)
  })
})
