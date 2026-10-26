import PreferencesPage from '../../../pages/preferences.page'
import NavigationPage from '../../../pages/navigation.page'
import HomePage from '../../../pages/home.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {
  PARTNER_AMI, PARTNER_DN, checkDemarchesConsent,
  publicationOutcome, grantDemarchesConsent, publishDemarche, publishNotification, revokeDemarchesConsent,
} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/test-users'
import {step} from '../../../helpers/report'
import {hasPageText} from '../../../helpers/spa'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Consentement et suivi des démarches (plan : consentement.md, scénarios S3 à S6). Réunion du 2026-10-06, 03:45–09:40.
 *
 * Ces scénarios MODIFIENT les consentements du compte `avec_nom_dusage` : l'état d'origine est relevé dans `before()` et rétabli
 * dans `after()` (les autres specs supposent le consentement AMI actif).
 */
describe('Non-régression — consentement et suivi des démarches', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(300000)

  const user = getUser('avec_nom_dusage')
  let original: Record<string, boolean> = {}

  /** Ouvre Préférences › Suivi des démarches depuis l'application. */
  async function openDemarchesConsents(): Promise<void> {
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
    await getAppToStartingState()
    await openDemarchesConsents()
    original = await PreferencesPage.demarchesConsentStates()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  after(async function () {
    await getAppToStartingState()
    await openDemarchesConsents()
    await PreferencesPage.restoreDemarchesConsents(original)
    // Le consentement AMI se rétablit aussi côté API : un test a pu le révoquer sans passer par la case.
    if (original[PARTNER_AMI]) await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    else await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
  })

  it('S3 — « Je veux suivre mes démarches » est proposé sans consentement et disparaît dès qu’un seul est actif', async function () {
    step('1. Retirer tous les consentements (toutes les cases de l’écran : 4 en préprod, 6 en staging)')
    await openDemarchesConsents()
    for (const key of Object.keys(await PreferencesPage.demarchesConsentStates())) await PreferencesPage.setDemarchesConsent(key, false)

    step('2. Accueil et Suivi proposent de suivre ses démarches')
    await NavigationPage.goToRoute('/')
    await HomePage.assertContentVisible()
    expect(await HomePage.isFollowButtonShown(10000)).toBe(true)
    await HomePage.ouvreSuivi()
    expect(await SuiviDemarchesPage.isFollowButtonShown(10000)).toBe(true)

    step('3. Activer un seul consentement, hors AMI (Démarche Numérique)')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_DN, true)

    step('4. Le bouton n’est plus proposé sur l’Accueil ni sur le Suivi')
    await NavigationPage.goToRoute('/')
    await HomePage.assertContentVisible()
    await browser.waitUntil(async () => !await HomePage.isFollowButtonShown(), {
      timeout: 10000, interval: 300, timeoutMsg: 'Le bouton « Je veux suivre mes démarches » est resté affiché sur l’Accueil avec un consentement actif',
    })
    await HomePage.ouvreSuivi()
    await browser.waitUntil(async () => !await SuiviDemarchesPage.isFollowButtonShown(), {
      timeout: 10000, interval: 300, timeoutMsg: 'Le bouton « Je veux suivre mes démarches » est resté affiché sur le Suivi avec un consentement actif',
    })
  })

  it('S4.1 — une case de consentement basculée est persistée côté backend', async function () {
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)

    step('1. Décocher « AMI » : le backend ne reconnaît plus le consentement')
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)
    await waitForBackendDemarchesConsent(false)

    step('2. Recocher « AMI » : le backend le reconnaît et la case reste cochée après rechargement')
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)
    await NavigationPage.reload()
    expect((await PreferencesPage.demarchesConsentStates())[PARTNER_AMI]).toBe(true)
  })

  it('S4.2 — « Tout suivre » active tous les consentements', async function () {
    await openDemarchesConsents()
    const keys = Object.keys(await PreferencesPage.demarchesConsentStates())
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) await PreferencesPage.setDemarchesConsent(key, false)

    await PreferencesPage.followAllDemarches()
    await browser.waitUntil(async () => {
      const states = await PreferencesPage.demarchesConsentStates()
      return keys.every(key => states[key])
    }, {timeout: 10000, interval: 300, timeoutMsg: `« Tout suivre » n’a pas coché les ${keys.length} consentements après 10000ms`})
    await waitForBackendDemarchesConsent(true)

    await NavigationPage.reload()
    const states = await PreferencesPage.demarchesConsentStates()
    expect(keys.map(key => states[key])).toEqual(keys.map(() => true))
  })

  // S5 et S5.2 manipulent le consentement du PARTENAIRE (aux démarches, seule porte connue) en publiant une notification simple. Qu'un
  // événement « notification » passe par cette même porte côté backend est NON CONFIRMÉ (consentement.md) ; ce n'est pas le réglage
  // des notifications push, global à AMI et sans endpoint.
  it('S5 — une notification reçue sans consentement n’apparaît jamais, même après activation ; la suivante oui', async function () {
    const stamp = Date.now()
    const before = `AMI-sans-consentement-${stamp}`
    const after = `AMI-avec-consentement-${stamp}`

    step('1. Retirer le consentement AMI (API) et publier N1 sans consentement')
    await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
    // Précondition vérifiée côté backend : sans elle, N1 pourrait être visible simplement parce que la révocation n'a pas eu lieu.
    expect(await checkDemarchesConsent(PARTNER_AMI, user.fcHash)).toBe(false)
    const issueN1 = await publicationOutcome(() => publishNotification({title: before, body: 'Doit rester invisible', recipientFcHash: user.fcHash, verifyPartnerConsent: false}))
    step(`N1 publiée sans consentement : ${issueN1} par l'API`)

    step('2. Activer le consentement AMI (API), ouvrir l’inbox puis publier N2')
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    // Avant de publier : l'inbox ouvre son WebSocket au montage (cf. notifications.test.ts).
    await NotificationsInboxPage.assertDisplayed()
    await publishNotification({title: after, body: 'Doit apparaître', recipientFcHash: user.fcHash})

    step('3. N2 est reçue ; N1 ne devrait jamais avoir été visible')
    await NotificationsInboxPage.assertNotificationReceived(after)
    // Constat du 2026-10-15 en préprod : N1 EST visible (publiée sans consentement, le backend l'accepte et l'affiche une fois le
    // consentement donné). Réunion, 06:42–06:53 : « tu ne récupères pas les notifs déjà envoyées, si je dis pas de bêtises » — attente
    // non confirmée : signalée, pas bloquante, jusqu'à validation avec Édouard (consentement.md).
    if (await NotificationsInboxPage.isNotificationListed(before, 2000)) {
      log.warn(`ANOMALIE ? La notification publiée SANS consentement (« ${before} », ${issueN1} par l'API) est visible après activation du consentement`)
    }
  })

  it('S5.2 — sans consentement, la notification publiée est observée dans l’inbox ; avec consentement, elle apparaît', async function () {
    const stamp = Date.now()
    const sans = `AMI-s52-sans-consentement-${stamp}`
    const avec = `AMI-s52-avec-consentement-${stamp}`

    step('1. Retirer le consentement AMI (API), ouvrir l’inbox')
    await revokeDemarchesConsent(PARTNER_AMI, user.fcHash)
    expect(await checkDemarchesConsent(PARTNER_AMI, user.fcHash)).toBe(false)
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    await NotificationsInboxPage.assertDisplayed()

    step('2. Publier une notification sans consentement et OBSERVER (constat, jamais un échec)')
    // Contrôle de ce que fait réellement l'API : `verifyPartnerConsent: false` saute seulement la garde côté test.
    const issue = await publicationOutcome(() => publishNotification({title: sans, body: 'Observée sans consentement', recipientFcHash: user.fcHash, verifyPartnerConsent: false}))
    step(`Publication sans consentement : ${issue} par l'API`)
    // Attente non confirmée (consentement.md § S5.2, question à Édouard) : on journalise ce que l'application fait, sans l'asserter.
    const avantReload = await NotificationsInboxPage.isNotificationListed(sans, 5000)
    await NavigationPage.reload()
    await NotificationsInboxPage.assertDisplayed()
    const apresReload = await NotificationsInboxPage.isNotificationListed(sans, 8000)
    if (issue === 'refusée' && (avantReload || apresReload)) {
      // Refusée (404) et pourtant visible : incohérence réelle, c'est un échec.
      throw new Error(`S5.2 : la publication sans consentement a été REFUSÉE par l'API mais « ${sans} » est visible dans l'inbox`)
    }
    if (issue === 'acceptée') {
      log.warn(`ANOMALIE ? S5.2 : l'API a ACCEPTÉ la publication sans consentement (le partenaire n'applique pas le consentement sur cet environnement ? non confirmé) : la scène « sans consentement » n'est pas exercée`)
    } else {
      log.info('OBS S5.2 : publication refusée par l\'API et notification absente de l\'inbox (avant et après rechargement), comme attendu')
    }

    step('3. Redonner le consentement : une notification publiée ensuite DOIT apparaître (fait certain, comme N2 de S5)')
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    expect(await checkDemarchesConsent(PARTNER_AMI, user.fcHash)).toBe(true)
    await NavigationPage.reload() // rouvre le WebSocket de l'inbox avec le consentement actif
    await NotificationsInboxPage.assertDisplayed()
    await publishNotification({title: avec, body: 'Doit apparaître', recipientFcHash: user.fcHash})
    await NotificationsInboxPage.assertNotificationReceived(avec)
  })

  it('S6 — décocher le consentement AMI alors qu’une démarche est suivie affiche l’avertissement', async function () {
    step('1. Publier une démarche suivie')
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    const itemId = `E2E-${new Date().toISOString()}`
    await publishDemarche({
      title: `Demarche E2E ${itemId} consentement`, body: 'Démarche suivie', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId, status: 'wip',
    })

    step('2. Décocher le consentement AMI')
    await getAppToStartingState()
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)

    step('3. L’avertissement annonce la perte du suivi et la conservation de l’historique')
    await PreferencesPage.assertDemarchesConsentWarningDisplayed()
    // Le sort des démarches déjà synchronisées n'est pas défini par la réunion : aucune assertion dessus (cf. consentement.md).
  })
  it('S6.2 — constat : après retrait du consentement AMI par l’interface, la démarche suivie reste-t-elle listée ?', async function () {
    const itemId = `E2E-${new Date().toISOString()}`
    const title = `Demarche E2E ${itemId} s62`

    /** Constat sur l'Accueil puis sur le Suivi : D4 y est-elle listée ? Aucune assertion (règle de gestion non définie, cf. consentement.md). */
    async function observeD4(moment: string): Promise<void> {
      await NavigationPage.goToRoute('/')
      await HomePage.assertContentVisible()
      const surAccueil = await hasPageText(title, 5000)
      await HomePage.ouvreSuivi()
      let surSuivi: boolean | 'page Suivi non confirmée' = 'page Suivi non confirmée'
      let statut = 'sans objet'
      // Piège établi : assertDisplayed() vise le h1 « Mes démarches » (le h2 existe aussi sur l'Accueil) ; on ne cherche pas avant de l'avoir confirmé.
      try {
        await SuiviDemarchesPage.assertDisplayed()
        surSuivi = await hasPageText(title, 8000)
        if (surSuivi) {
          try {
            await SuiviDemarchesPage.assertVisibleDemarcheWith(title, 'En cours', 3000)
            statut = 'En cours'
          } catch { statut = 'différent de « En cours » (publiée avec le statut wip) ou illisible' }
        }
      } catch {
        log.warn(`ANOMALIE ? S6.2 ${moment} : le titre « Mes démarches » (h1) n'est pas affiché sur le Suivi`)
      }
      log.info(`OBS S6.2 ${moment} : D4 listée sur l'Accueil : ${surAccueil} ; sur le Suivi : ${surSuivi} ; statut : ${statut}`)
    }

    step('1. Publier D4 (consentement AMI actif) et la retrouver dans le Suivi')
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await publishDemarche({title, body: 'Démarche suivie', recipientFcHash: user.fcHash, itemType: 'OTV', itemId, status: 'wip'})
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(title)

    step('2. Décocher le consentement AMI par l’interface, OBSERVER D4')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)
    await waitForBackendDemarchesConsent(false)
    await observeD4('consentement retiré')

    step('3. Recocher le consentement AMI, OBSERVER D4')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)
    await observeD4('consentement rétabli')
  })
})
