import logger from '@wdio/logger'
import PreferencesPage from '../../../pages/preferences.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import DemarcheDetailPage from '../../../pages/demarche-detail.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {PARTNER_AMI, PARTNER_DN, getBackendUrl, checkDemarchesConsent, publicationOutcome, grantDemarchesConsent, publishDemarche, revokeDemarchesConsent, hasPartnerCredentials, skipUnlessPartnerCredentials, type PartnerId} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/** Partenaire à consentement activé (voir l'en-tête du describe). */
const PARTNER = PARTNER_DN

/**
 * Consentement au SUIVI DES DÉMARCHES (plan : consentement.md, scénario S6.3). Décision de l'utilisateur (2026-10-26) : sans
 * consentement, une démarche « D1 prime » presque pleine de données est REFUSÉE (404) et n'est JAMAIS reçue (ni Suivi, ni
 * notifications, avant comme après le consentement). Une fois le consentement donné, D1 bis (même `item_id`, presque vide) est reçue :
 * le détail de la démarche porte le champ VIDE de D1 bis et non la valeur de D1 prime, preuve que l'app n'a jamais eu D1 prime.
 *
 * Champ discriminant : `content_link` (vérifié dans ami-notifications-api, ami/followup/schemas.py). Le lien externe d'une démarche est le
 * DERNIER `content_link` non vide de toutes les notifications reçues : si D1 prime avait été reçue, le bouton « Accéder à ma démarche » serait
 * proposé malgré D1 bis sans lien. `content_body` est obligatoire (non vide) et sert de marqueur : le corps de D1 prime ne doit jamais
 * apparaître dans le détail. Que D1 bis apparaisse au Suivi et dans les notifications est normal (une démarche est une notification).
 *
 * PARTENAIRE : `dinum-dn` (consentement ACTIVÉ côté backend). Le partenaire AMI est un partenaire SYSTÈME dont le consentement est ignoré
 * (un PUT sans consentement y répond 201) : il ne peut pas exercer ce scénario. Identifiants DN : NOTIF_PARTNER_DINUM_DN_ID / _SECRET
 * (.env.local) ; absents, le scénario est SKIPPÉ (BLOQUÉ) avec un message qui les nomme.
 *
 * MODIFIE le consentement DN (et AMI) du compte partagé `avec_nom_dusage` : état d'origine relevé au `before()`, rétabli à l'`after()`. Les
 * démarches publiées (titres horodatés) restent sur le compte : aucune suppression n'est connue.
 */
describe('Non-régression — démarches publiées sans consentement au suivi', function () {
  // Délai posé au niveau du describe : un this.timeout() dans un it/hook est ignoré par WDIO (il lit le délai avant d'exécuter).
  this.timeout(420000)

  const user = getUser('avec_nom_dusage')
  let original: Record<string, boolean> = {}

  /** Ouvre Préférences > Suivi des démarches depuis l'application. */
  async function openDemarchesConsents(): Promise<void> {
    await getAppToStartingState()
    await PreferencesPage.open()
    await PreferencesPage.openDemarchesConsents()
  }

  /** Le consentement du partenaire aux démarches vu par le backend atteint-il `expected` ? (la bascule d'une case est asynchrone) */
  async function waitForBackendDemarchesConsent(partner: PartnerId, expected: boolean): Promise<void> {
    await browser.waitUntil(async () => await checkDemarchesConsent(partner, user.fcHash) === expected, {
      timeout: 10000, interval: 500, timeoutMsg: `Le backend ne renvoie pas « consentement ${partner} = ${expected} » après 10000ms`,
    })
  }

  before(async function () {
    await openDemarchesConsents()
    original = await PreferencesPage.demarchesConsentStates()
  })

  after(async function () {
    await openDemarchesConsents()
    await PreferencesPage.restoreDemarchesConsents(original)
    // Aligné aussi par l'API : un test a pu le révoquer sans passer par la case (DN : seulement si ses identifiants sont fournis).
    if (original[PARTNER_AMI]) await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    else await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
    if (hasPartnerCredentials(PARTNER_DN)) {
      if (original[PARTNER_DN]) await grantDemarchesConsent(PARTNER_DN, user.fcHash)
      else await revokeDemarchesConsent(PARTNER_DN, user.fcHash)
    }
  })

  it('S6.3 — D1 prime (sans consentement) n’est jamais reçue ; après consentement, D1 bis (sans lien) est reçue et le détail n’a pas le lien de D1 prime', async function () {
    skipUnlessPartnerCredentials(this, PARTNER)
    const stamp = new Date().toISOString()
    const itemId = `E2E-${stamp}`
    const prime = {title: `Demarche E2E ${stamp} D1prime sans consentement`, body: `Corps de D1 prime ${stamp}`, subheading: `Service D1 prime ${stamp}`,
      link: `${getBackendUrl()}/demarches/${itemId}/prime`}
    const bis = {title: `Demarche E2E ${stamp} D1bis apres consentement`, body: `Corps de D1 bis ${stamp}`}

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
    /** Depuis une page à barre basse, revient à l'Accueil puis ouvre l'inbox des notifications. */
    const ouvrirLesNotifications = async (): Promise<void> => {
      await NavigationPage.goToTab('Accueil')
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
    }
    /** D1 prime n'est ni au Suivi (liste) ni dans les notifications. */
    const assertPrimeJamaisRecue = async (moment: string): Promise<void> => {
      step(`D1 prime absente du Suivi et des notifications (${moment})`)
      await ouvrirLeSuivi()
      expect(await SuiviDemarchesPage.isDemarcheListed(prime.title, 3000)).toBe(false)
      await ouvrirLesNotifications()
      expect(await NotificationsInboxPage.isNotificationListed(prime.title, 3000)).toBe(false)
    }

    step('1. Retirer le consentement au suivi des démarches (case du partenaire)')
    await PreferencesPage.setDemarchesConsent(PARTNER, false)
    await waitForBackendDemarchesConsent(PARTNER, false)
    await marquer()

    step('2. Publier D1 prime, presque pleine (corps, sous-titre, lien), sans consentement : le backend REFUSE (404)')
    // Un partenaire réel ferait d'abord GET consent puis s'arrêterait ; ici on force le PUT pour vérifier que le BACKEND refuse (404).
    const issuePrime = await publicationOutcome(() => publishDemarche({
      title: prime.title, body: prime.body, subheading: prime.subheading, contentLink: prime.link, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'new', partner: PARTNER, verifyPartnerConsent: false,
    }))
    log.info(`D1 prime publiée sans consentement : ${issuePrime} par l'API`)
    expect(issuePrime).toBe('refusée')

    step('3. Attendre 4 secondes, recharger l’Accueil : D1 prime est absente (consentement retiré)')
    // eslint-disable-next-line wdio/no-pause -- délai imposé par le scénario de l'équipe : laisser au backend le temps de traiter l'événement
    await browser.pause(4000)
    await NavigationPage.goToRoute('/')
    await NavigationPage.reload()
    await HomePage.assertContentVisible()
    await assertPrimeJamaisRecue('avant consentement')

    step('4. Remettre le consentement (case du partenaire)')
    await NavigationPage.goToRoute('/')
    await HomePage.assertContentVisible()
    await PreferencesPage.open()
    await PreferencesPage.openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER, true)
    await waitForBackendDemarchesConsent(PARTNER, true)
    await marquer()

    step('5. Publier D1 bis (même item_id), presque vide : corps seul, sans sous-titre ni lien')
    await publishDemarche({
      title: bis.title, body: bis.body, recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'wip', partner: PARTNER,
    })

    step('6. D1 bis est reçue au Suivi ; D1 prime reste absente')
    await ouvrirLeSuivi()
    await SuiviDemarchesPage.waitForDemarche(bis.title)
    expect(await SuiviDemarchesPage.isDemarcheListed(prime.title, 3000)).toBe(false)

    step('7. Détail de la démarche : le lien est VIDE comme dans D1 bis, et rien de D1 prime')
    await SuiviDemarchesPage.ouvreDemarche(bis.title)
    await DemarcheDetailPage.assertDisplayed(bis.title)
    await DemarcheDetailPage.assertReference(itemId)
    expect(await DemarcheDetailPage.hasText(bis.body, 5000)).toBe(true)
    expect(await DemarcheDetailPage.isLienExterneProposed(3000)).toBe(false)
    expect(await DemarcheDetailPage.hasText(prime.body, 1000)).toBe(false)
    expect(await DemarcheDetailPage.hasText(prime.subheading, 1000)).toBe(false)
    await marquer()

    step('8. Notifications : D1 bis est reçue (normal : une démarche est une notification) ; D1 prime n’y est jamais')
    await NavigationPage.goBack()
    await SuiviDemarchesPage.assertDisplayed()
    await ouvrirLesNotifications()
    await NotificationsInboxPage.assertNotificationReceived(bis.title)
    expect(await NotificationsInboxPage.isNotificationListed(prime.title, 3000)).toBe(false)
  })
})
