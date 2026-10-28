import logger from '@wdio/logger'
import PreferencesPage from '../../../pages/preferences.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import DemarcheDetailPage from '../../../pages/demarche-detail.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {openDemarchesConsents, restoreDemarchesConsents, waitForBackendDemarchesConsent} from '../../../pages/consents.process'
import {PARTNER_DN, getBackendUrl, publicationOutcome, grantDemarchesConsent, publishDemarche, revokeDemarchesConsent, skipUnlessPartnerCredentials} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/** Partenaire à consentement activé (voir l'en-tête du describe). */
const PARTNER = PARTNER_DN

/**
 * Démarche publiée par un partenaire SANS consentement de l'usager : le backend la REFUSE (404) et l'app ne la reçoit JAMAIS (ni Suivi des
 * démarches, ni centre de notifications, avant comme après le consentement). Deux scénarios identiques dans leur déroulé, qui ne diffèrent
 * que par la façon dont le consentement est retiré puis donné : par l'API partenaire, ou par les cases de Préférences › Suivi des démarches.
 * Décision de l'utilisateur (2026-10-26).
 *
 * Déroulé : « D1 prime » (corps, sous-titre, lien) est publiée sans consentement : la garde côté appelant s'arrête avant le PUT, et le PUT forcé est
 * refusé par le backend. Une fois le consentement donné, « D1 bis » (même `item_id`, corps seul : ni sous-titre ni lien) est reçue : le détail de la
 * démarche porte le champ VIDE de D1 bis et non la valeur de D1 prime, preuve que l'app n'a jamais eu D1 prime.
 *
 * Champ discriminant : `content_link` (vérifié dans ami-notifications-api, ami/followup/schemas.py). Le lien externe d'une démarche est le
 * DERNIER `content_link` non vide de toutes les notifications reçues : si D1 prime avait été reçue, le bouton « Accéder à ma démarche » serait
 * proposé malgré D1 bis sans lien. `content_body` est obligatoire (non vide) et sert de marqueur : le corps de D1 prime ne doit jamais
 * apparaître dans le détail. Que D1 bis apparaisse au Suivi et dans le centre de notifications est normal (une démarche est une notification).
 *
 * PARTENAIRE : `dinum-dn` (consentement ACTIVÉ côté backend). Le partenaire AMI est un partenaire SYSTÈME dont le consentement est ignoré
 * (un PUT sans consentement y répond 201) : il ne peut pas exercer ce scénario. Identifiants DN : NOTIF_PARTNER_DINUM_DN_ID / _SECRET
 * (.env) ; absents, les scénarios sont SKIPPÉS (BLOQUÉS) avec un message qui les nomme.
 *
 * MODIFIE le consentement DN (et AMI) du compte partagé `avec_nom_dusage` : état d'origine relevé au `before()`, rétabli à l'`after()`. Les
 * démarches publiées (titres horodatés) restent sur le compte : aucune suppression n'est connue.
 */
describe('Non-régression — démarche publiée sans consentement : refusée et jamais reçue', function () {
  // Délai posé au niveau du describe : un this.timeout() dans un it/hook est ignoré par WDIO (il lit le délai avant d'exécuter).
  this.timeout(420000)

  const user = getUser('avec_nom_dusage')
  let original: Record<string, boolean> = {}

  /** Retire et donne le consentement du partenaire : c'est la SEULE différence entre les deux scénarios. */
  type PilotageDuConsentement = {retirer: () => Promise<void>, donner: () => Promise<void>}

  /** Par l'API partenaire. Le rechargement de l'app (WebSocket de l'inbox compris) prend en compte le nouvel état. */
  const parLApi: PilotageDuConsentement = {
    retirer: async () => {
      await revokeDemarchesConsent(PARTNER, user.fcHash)
      await waitForBackendDemarchesConsent(PARTNER, user.fcHash, false)
    },
    donner: async () => {
      await grantDemarchesConsent(PARTNER, user.fcHash)
      await waitForBackendDemarchesConsent(PARTNER, user.fcHash, true)
      await NavigationPage.reload()
    },
  }

  /** Par les cases de Préférences › Suivi des démarches. */
  const parLesPreferences: PilotageDuConsentement = {
    retirer: async () => {
      await openDemarchesConsents()
      await PreferencesPage.setDemarchesConsent(PARTNER, false)
      await waitForBackendDemarchesConsent(PARTNER, user.fcHash, false)
    },
    donner: async () => {
      await openDemarchesConsents()
      await PreferencesPage.setDemarchesConsent(PARTNER, true)
      await waitForBackendDemarchesConsent(PARTNER, user.fcHash, true)
    },
  }

  before(async function () {
    await getAppToStartingState()
    await openDemarchesConsents()
    original = await PreferencesPage.demarchesConsentStates()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  after(async function () {
    await getAppToStartingState()
    await restoreDemarchesConsents(original, user.fcHash)
  })

  /** Déroulé commun : D1 prime refusée sans consentement et jamais reçue ; D1 bis reçue après consentement. */
  async function scenarioDemarcheSansConsentement(consentement: PilotageDuConsentement): Promise<void> {
    const stamp = new Date().toISOString()
    const itemId = `E2E-sans-consentement-${stamp}`
    const prime = {title: `Demarche E2E ${stamp} D1prime sans consentement`, body: `Corps de D1 prime ${stamp}`, subheading: `Service D1 prime ${stamp}`,
      link: `${getBackendUrl()}/demarches/${itemId}/prime`}
    const bis = {title: `Demarche E2E ${stamp} D1bis apres consentement`, body: `Corps de D1 bis ${stamp}`}
    const primeOptions = {
      title: prime.title, body: prime.body, subheading: prime.subheading, contentLink: prime.link, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'new' as const, partner: PARTNER,
    }

    /** Tient l'écran courant pour qu'il soit lisible dans la vidéo. */
    const marquer = async (): Promise<void> => {
      // eslint-disable-next-line wdio/no-pause -- pause voulue : tenir l'écran lisible dans la vidéo, aucune condition à attendre
      await browser.pause(1500)
    }
    /** Revient à l'Accueil (barre basse absente des Préférences et des Notifications) puis ouvre le Suivi, vérifié par son h1. */
    const ouvrirLeSuivi = async (): Promise<void> => {
      await NavigationPage.goToRoute('/')
      await HomePage.assertContentVisible()
      await HomePage.ouvreSuivi()
      await SuiviDemarchesPage.assertDisplayed()
    }
    /** Depuis une page à barre basse, revient à l'Accueil puis ouvre le centre de notifications. */
    const ouvrirLesNotifications = async (): Promise<void> => {
      await NavigationPage.goToTab('Accueil')
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
    }
    /** D1 prime n'est ni au Suivi des démarches ni dans le centre de notifications. */
    const assertPrimeJamaisRecue = async (moment: string): Promise<void> => {
      step(`D1 prime absente du Suivi et du centre de notifications (${moment})`)
      await ouvrirLeSuivi()
      expect(await SuiviDemarchesPage.isDemarcheListed(prime.title, 3000)).toBe(false)
      await ouvrirLesNotifications()
      expect(await NotificationsInboxPage.isNotificationListed(prime.title, 3000)).toBe(false)
    }

    step('1. Retirer le consentement du partenaire, le backend le confirme')
    await consentement.retirer()
    await marquer()

    step('2. Garde côté appelant : un partenaire réel s’arrête avant le PUT (pas de consentement)')
    await expect(publishDemarche(primeOptions)).rejects.toThrow(/pas de consentement/)

    step('3. D1 prime, presque pleine (corps, sous-titre, lien), publiée sans consentement : le BACKEND refuse (404)')
    // `verifyPartnerConsent: false` saute la garde et force le PUT, pour vérifier que c'est bien le backend qui refuse.
    const issuePrime = await publicationOutcome(() => publishDemarche({...primeOptions, verifyPartnerConsent: false}))
    log.info(`D1 prime publiée sans consentement : ${issuePrime} par l'API`)
    expect(issuePrime).toBe('refusée')

    step('4. Attendre 4 secondes, recharger : D1 prime est absente (consentement retiré)')
    // eslint-disable-next-line wdio/no-pause -- délai imposé par le scénario de l'équipe : laisser au backend le temps de traiter l'événement
    await browser.pause(4000)
    await NavigationPage.goToRoute('/')
    await NavigationPage.reload()
    await HomePage.assertContentVisible()
    await assertPrimeJamaisRecue('avant consentement')

    step('5. Donner le consentement du partenaire, le backend le confirme')
    await consentement.donner()
    await marquer()

    step('6. Publier D1 bis (même item_id), presque vide : corps seul, sans sous-titre ni lien')
    await publishDemarche({
      title: bis.title, body: bis.body, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'wip', partner: PARTNER,
    })

    step('7. D1 bis est reçue au Suivi ; D1 prime reste absente')
    await ouvrirLeSuivi()
    await SuiviDemarchesPage.waitForDemarche(bis.title)
    expect(await SuiviDemarchesPage.isDemarcheListed(prime.title, 3000)).toBe(false)

    step('8. Détail de la démarche : le lien est VIDE comme dans D1 bis, et rien de D1 prime')
    await SuiviDemarchesPage.ouvreDemarche(bis.title)
    await DemarcheDetailPage.assertDisplayed(bis.title)
    await DemarcheDetailPage.assertReference(itemId)
    expect(await DemarcheDetailPage.hasText(bis.body, 5000)).toBe(true)
    expect(await DemarcheDetailPage.isLienExterneProposed(3000)).toBe(false)
    expect(await DemarcheDetailPage.hasText(prime.body, 1000)).toBe(false)
    expect(await DemarcheDetailPage.hasText(prime.subheading, 1000)).toBe(false)
    await marquer()

    step('9. Centre de notifications : D1 bis est reçue (normal : une démarche est une notification) ; D1 prime n’y est jamais')
    await NavigationPage.goBack()
    await SuiviDemarchesPage.assertDisplayed()
    await ouvrirLesNotifications()
    await NotificationsInboxPage.assertNotificationReceived(bis.title)
    expect(await NotificationsInboxPage.isNotificationListed(prime.title, 3000)).toBe(false)
  }

  it('démarche D1 sans consentement : refusée par le backend et jamais reçue, consentement retiré puis donné par l’API partenaire', async function () {
    skipUnlessPartnerCredentials(this, PARTNER)
    await scenarioDemarcheSansConsentement(parLApi)
  })

  it('démarche D1 sans consentement : refusée par le backend et jamais reçue, consentement retiré puis donné par les Préférences de l’app', async function () {
    skipUnlessPartnerCredentials(this, PARTNER)
    await scenarioDemarcheSansConsentement(parLesPreferences)
  })
})
