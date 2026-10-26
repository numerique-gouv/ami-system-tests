import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import PreferencesPage from '../../../pages/preferences.page'
import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {PARTNER_AMI, checkDemarchesConsent, publicationOutcome, grantDemarchesConsent, publishDemarche, revokeDemarchesConsent} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/test-users'
import {step} from '../../../helpers/report'

const log = logger('test')

/**
 * Consentement au SUIVI DES DÉMARCHES (plan : consentement.md, scénario S6.3). Scénario décrit par l'équipe (2026-10-15) : sans
 * consentement, une démarche publiée n'apparaît ni au Suivi ni dans les notifications ; une fois le consentement redonné, la mise à jour
 * de cette démarche et sa création ne reviennent pas, seule la NOUVELLE démarche publiée après le consentement apparaît.
 *
 * Les attentes de l'équipe sont vérifiées étape par étape SANS interrompre le scénario (écarts collectés puis listés à la fin) : le
 * déroulé complet reste lisible, y compris dans la vidéo (`wdio.webapp.with_video.conf.ts`). Une attente qui n'est pas tenue est un
 * écart à confronter à la règle de gestion (Édouard), pas forcément un défaut de l'application.
 *
 * MODIFIE le consentement AMI du compte partagé `avec_nom_dusage` : état d'origine relevé au `before()`, rétabli à l'`after()`. Les
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

  /** Le consentement AMI aux démarches vu par le backend atteint-il `expected` ? (la bascule d'une case est asynchrone) */
  async function waitForBackendDemarchesConsent(expected: boolean): Promise<void> {
    await browser.waitUntil(async () => await checkDemarchesConsent(PARTNER_AMI, user.fcHash) === expected, {
      timeout: 10000, interval: 500, timeoutMsg: `Le backend ne renvoie pas « consentement AMI = ${expected} » après 10000ms`,
    })
  }

  before(async function () {
    await openDemarchesConsents()
    original = await PreferencesPage.demarchesConsentStates()
  })

  after(async function () {
    await openDemarchesConsents()
    await PreferencesPage.restoreDemarchesConsents(original)
    // Aligné aussi par l'API : un test a pu le révoquer sans passer par la case.
    if (original[PARTNER_AMI]) await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    else await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
  })

  it('S6.3 — sans consentement la démarche n’apparaît ni au Suivi ni aux notifications ; après consentement seule la nouvelle apparaît', async function () {
    const stamp = new Date().toISOString()
    const d1 = {itemId: `E2E-${stamp}-1`, title: `Demarche E2E ${stamp} D1 sans consentement`}
    const d1Maj = {...d1, title: `${d1.title} MAJ`}
    const d2 = {itemId: `E2E-${stamp}-2`, title: `Demarche E2E ${stamp} D2 avec consentement`}
    const ecarts: string[] = []

    /** Journalise une attente de l'équipe et collecte l'écart sans interrompre le scénario. */
    const constate = (etape: string, attente: string, presente: boolean, presenteAttendue: boolean): void => {
      const tenue = presente === presenteAttendue
      const observe = presente ? 'présente' : 'absente'
      const ligne = `${tenue ? 'OK' : 'ÉCART'} — ${etape} : ${attente} (observé : ${observe})`
      log[tenue ? 'info' : 'warn'](ligne)
      step(ligne) // visible dans les étapes du dump (`just failures-text`)
      if (!tenue) ecarts.push(`${etape} : attendu « ${attente} », observé ${observe}`)
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
    /** Depuis le Suivi (barre basse présente), revient à l'Accueil puis ouvre l'inbox des notifications. */
    const ouvrirLesNotifications = async (): Promise<void> => {
      await NavigationPage.goToTab('Accueil')
      await NotificationsInboxPage.openFromHome()
      await NotificationsInboxPage.assertDisplayed()
    }

    step('1. Retirer le consentement au suivi des démarches (case « AMI »)')
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)
    await waitForBackendDemarchesConsent(false)
    await marquer()

    step('2. Publier la démarche D1 (sans consentement)')
    const issueD1 = await publicationOutcome(() => publishDemarche({
      title: d1.title, body: 'Création de D1 (sans consentement)', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId: d1.itemId, status: 'new', verifyPartnerConsent: false,
    }))
    // Cause des écarts « présente » ci-dessous : si l'API ACCEPTE D1 sans consentement (constat staging du 2026-10-26 : HTTP 201), D1 existe
    // côté backend et l'inbox la liste ; l'attente de l'équipe suppose un refus (404).
    step(`D1 publiée sans consentement : ${issueD1} par l'API`)

    step('3. Attendre 4 secondes, puis recharger l’Accueil')
    // eslint-disable-next-line wdio/no-pause -- délai imposé par le scénario de l'équipe : laisser au backend le temps de traiter l'événement
    await browser.pause(4000)
    await NavigationPage.goToRoute('/')
    await NavigationPage.reload()
    await HomePage.assertContentVisible()
    await marquer()

    step('4. Ouvrir le Suivi des démarches : D1 doit être absente')
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    constate('Suivi, sans consentement', 'D1 absente', await SuiviDemarchesPage.isDemarcheListed(d1.title, 3000), false)
    await marquer()

    step('5. Ouvrir les notifications : D1 doit être absente')
    await ouvrirLesNotifications()
    constate('Notifications, sans consentement', 'D1 absente', await NotificationsInboxPage.isNotificationListed(d1.title, 3000), false)
    await marquer()

    step('6. Remettre le consentement (case « AMI »)')
    await NavigationPage.goToRoute('/')
    await HomePage.assertContentVisible()
    await PreferencesPage.open()
    await PreferencesPage.openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)
    await marquer()

    step('7. Publier une mise à jour de D1, puis la création d’une 2e démarche D2')
    await publishDemarche({
      title: d1Maj.title, body: 'Mise à jour de D1', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId: d1Maj.itemId, status: 'wip',
    })
    await publishDemarche({
      title: d2.title, body: 'Création de D2', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId: d2.itemId, status: 'new',
    })

    step('8. Ouvrir le Suivi, attendre D2 : la mise à jour de D1 doit être absente')
    await ouvrirLeSuivi()
    await SuiviDemarchesPage.waitForDemarche(d2.title)
    constate('Suivi, après consentement', 'D2 présente', await SuiviDemarchesPage.isDemarcheListed(d2.title, 1000), true)
    // `d1.title` est un préfixe de `d1Maj.title` : une seule sonde couvre la création ET la mise à jour de D1.
    constate('Suivi, après consentement', 'D1 (mise à jour) absente', await SuiviDemarchesPage.isDemarcheListed(d1.title, 3000), false)
    await marquer()

    step('9. Ouvrir les notifications : les deux démarches doivent être absentes')
    await ouvrirLesNotifications()
    constate('Notifications, après consentement', 'D1 absente', await NotificationsInboxPage.isNotificationListed(d1.title, 3000), false)
    constate('Notifications, après consentement', 'D2 absente', await NotificationsInboxPage.isNotificationListed(d2.title, 3000), false)
    await marquer()

    if (ecarts.length > 0) {
      throw new AssertionError({message: `${ecarts.length} attente(s) de l'équipe non tenue(s) (D1 sans consentement : ${issueD1} par l'API) :\n${ecarts.join('\n')}`})
    }
  })
})
