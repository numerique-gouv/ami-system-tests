import PreferencesPage from '../../../pages/preferences.page'
import NavigationPage from '../../../pages/navigation.page'
import HomePage from '../../../pages/home.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {openDemarchesConsents, reopenDemarchesConsents, restoreDemarchesConsents, uncheckAllDemarchesConsents, waitForBackendDemarchesConsent as waitForBackendConsent} from '../../../pages/consents.process'
import {PARTNER_AMI, PARTNER_DN, grantDemarchesConsent, publishDemarche} from '../../../helpers/partner-api'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'
import {hasPageText} from '../../../helpers/spa/spa'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Consentement et suivi des démarches. Modifie les consentements du compte `avec_nom_dusage` : l'état d'origine est relevé dans `before()` et
 * rétabli dans `after()` (les autres specs supposent le consentement AMI actif).
 */
describe('Non-régression — consentement et suivi des démarches', function () {
  this.timeout(300000)

  const user = getTestUser()
  let original: Record<string, boolean> = {}

  /** Le consentement AMI aux démarches vu par le backend atteint-il `expected` ? */
  const waitForBackendDemarchesConsent = (expected: boolean): Promise<void> => waitForBackendConsent(PARTNER_AMI, user.fcHash, expected)

  before(async function () {
    await getAppToStartingState()
    await openDemarchesConsents()
    original = await PreferencesPage.demarchesConsentStates()
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  after(async function () {
    await restoreDemarchesConsents(original, user.fcHash)
  })

  it('« Je veux suivre mes démarches » est proposé sans consentement et disparaît dès qu’un seul est actif', async function () {
    step('1. Retirer tous les consentements (toutes les cases de l’écran : 4 en préprod, 6 en staging)')
    await openDemarchesConsents()
    await uncheckAllDemarchesConsents()

    step('2. Accueil et Suivi proposent de suivre ses démarches')
    await NavigationPage.goToRoute('/')
    await HomePage.assertDisplayed()
    expect(await HomePage.isFollowButtonShown(10000)).toBe(true)
    await HomePage.ouvreSuivi()
    expect(await SuiviDemarchesPage.isFollowButtonShown(10000)).toBe(true)

    step('3. Activer un seul consentement, hors AMI (Démarche Numérique)')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_DN, true)

    step('4. Le bouton n’est plus proposé sur l’Accueil ni sur le Suivi')
    await NavigationPage.goToRoute('/')
    await HomePage.assertDisplayed()
    await browser.waitUntil(async () => !await HomePage.isFollowButtonShown(), {
      timeout: 10000, interval: 300, timeoutMsg: 'Le bouton « Je veux suivre mes démarches » est resté affiché sur l’Accueil avec un consentement actif',
    })
    await HomePage.ouvreSuivi()
    await browser.waitUntil(async () => !await SuiviDemarchesPage.isFollowButtonShown(), {
      timeout: 10000, interval: 300, timeoutMsg: 'Le bouton « Je veux suivre mes démarches » est resté affiché sur le Suivi avec un consentement actif',
    })
  })

  it('une case de consentement basculée est persistée côté backend', async function () {
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await openDemarchesConsents()

    step('1. Décocher « AMI » : le backend ne reconnaît plus le consentement')
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)
    await waitForBackendDemarchesConsent(false)

    step('2. Recocher « AMI » : le backend le reconnaît et la case reste cochée en revenant sur l’écran')
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)
    await reopenDemarchesConsents()
    expect((await PreferencesPage.demarchesConsentStates())[PARTNER_AMI]).toBe(true)
  })

  it('« Tout suivre » active tous les consentements', async function () {
    await openDemarchesConsents()
    const keys = await uncheckAllDemarchesConsents()
    expect(keys).not.toHaveLength(0)

    await PreferencesPage.followAllDemarches()
    await browser.waitUntil(async () => {
      const states = await PreferencesPage.demarchesConsentStates()
      return keys.every(key => states[key])
    }, {timeout: 10000, interval: 300, timeoutMsg: `« Tout suivre » n’a pas coché les ${keys.length} consentements après 10000ms`})
    await waitForBackendDemarchesConsent(true)

    await reopenDemarchesConsents()
    const states = await PreferencesPage.demarchesConsentStates()
    expect(keys.map(key => states[key])).toEqual(keys.map(() => true))
  })

  it('retirer le consentement AMI alors qu’une démarche est suivie : avertissement affiché, démarche masquée puis retrouvée au rétablissement (constat)', async function () {
    const itemId = `E2E-consentement-${new Date().toISOString()}`
    const title = `Demarche E2E ${itemId} D4`

    /** Constat sur l'Accueil puis sur le Suivi : D4 y est-elle listée ? Aucune assertion (règle de gestion non définie). */
    async function observeD4(moment: string): Promise<void> {
      await NavigationPage.goToRoute('/')
      await HomePage.assertDisplayed()
      const surAccueil = await hasPageText(title, 5000)
      await HomePage.ouvreSuivi()
      let surSuivi: boolean | 'page Suivi non confirmée' = 'page Suivi non confirmée'
      let statut = 'sans objet'
      // assertDisplayed() vise le h1 « Mes démarches » (le h2 existe aussi sur l'Accueil) : ne chercher D4 qu'après l'avoir confirmé.
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
        log.warn(`ANOMALIE ? D4 ${moment} : le titre « Mes démarches » (h1) n'est pas affiché sur le Suivi`)
      }
      log.info(`OBS D4 ${moment} : D4 listée sur l'Accueil : ${surAccueil} ; sur le Suivi : ${surSuivi} ; statut : ${statut}`)
    }

    step('1. Publier D4 (consentement AMI actif) et la retrouver dans le Suivi')
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await publishDemarche({title, body: 'Démarche suivie', recipientFcHash: user.fcHash, itemType: 'OTV', itemId, status: 'wip'})
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(title)

    step('2. Décocher le consentement AMI par l’interface : l’avertissement annonce la perte du suivi et la conservation de l’historique')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, false)
    await PreferencesPage.assertDemarchesConsentWarningDisplayed()
    await waitForBackendDemarchesConsent(false)

    step('3. OBSERVER D4 consentement retiré (constat : le sort des démarches déjà synchronisées n’est pas défini)')
    await observeD4('consentement retiré')

    step('4. Recocher le consentement AMI, OBSERVER D4')
    await openDemarchesConsents()
    await PreferencesPage.setDemarchesConsent(PARTNER_AMI, true)
    await waitForBackendDemarchesConsent(true)
    await observeD4('consentement rétabli')
  })
})
