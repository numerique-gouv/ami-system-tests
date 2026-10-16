import PreferencesPage from '../../../pages/preferences.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {checkConsent, grantConsent, publishNotification, revokeConsent} from '../../../helpers/partner-api'
import {getUser} from '../../../helpers/test-users'
import {step} from '../../../helpers/report'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * DÉMONSTRATION (pas un test de non-régression) : « un usager donne son consentement et reçoit alors une notification arrivée AVANT
 * qu'il l'ait donné » (constat ANOMALIE ? de S5, consentement.test.ts). Le consentement est piloté PAR L'INTERFACE (case « AMI » de
 * Préférences › Suivi des démarches) pour être visible à l'écran, et chaque état est tenu ~2 s pour être lisible dans la vidéo.
 *
 * Extension `.demo.ts` : hors des globs `**\/*.test.ts` des suites. Lancement (préprod, vidéo gardée même en cas de réussite) :
 *   set -a; . ./.env.local; set +a
 *   AMI_ENV=preprod just test-webvideo src/tests/webapp/nonreg/demo-consentement.demo.ts
 * La vidéo (.webm) est écrite dans `test-results/traces/<horodatage>_webapp_…/test-results/video-*.webm`.
 *
 * Modifie le consentement AMI du compte partagé `avec_nom_dusage` : l'état d'origine est rétabli dans `after()`.
 */
describe('Démonstration — notification reçue avant le consentement, visible après', function () {
  // Délai posé au niveau du describe : un this.timeout() dans un it/hook est ignoré par WDIO.
  this.timeout(420000)

  const user = getUser('avec_nom_dusage')
  const MARQUE_MS = 2000
  let original: Record<string, boolean> = {}

  /** Tient l'écran courant `MARQUE_MS` pour qu'il soit lisible dans la vidéo. */
  async function marquer(): Promise<void> {
    // eslint-disable-next-line wdio/no-pause -- pause voulue : tenir l'écran lisible dans la vidéo, aucune condition à attendre
    await browser.pause(MARQUE_MS)
  }

  async function openConsents(): Promise<void> {
    await getAppToStartingState()
    await PreferencesPage.open()
    await PreferencesPage.openConsents()
  }

  async function waitForBackendConsent(expected: boolean): Promise<void> {
    await browser.waitUntil(async () => await checkConsent(user.fcHash) === expected, {
      timeout: 10000, interval: 500, timeoutMsg: `Le backend ne renvoie pas « consentement AMI = ${expected} » après 10000ms`,
    })
  }

  before(async function () {
    await openConsents()
    original = await PreferencesPage.consentStates()
  })

  after(async function () {
    await openConsents()
    await PreferencesPage.restoreConsents(original)
    if (original['dinum-ami']) await grantConsent(user.fcHash)
    else await revokeConsent(user.fcHash)
  })

  it('le consentement donné fait apparaître une notification publiée avant lui', async function () {
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, 'h')
    const n1 = `N1 publiée SANS consentement ${stamp}`
    const n2 = `N2 publiée AVEC consentement ${stamp}`

    step('i. Retirer le consentement AMI par l’interface')
    await openConsents()
    // Partir d'un état coché, pour que le retrait soit visible (et déclenche l'avertissement le cas échéant).
    if (!(await PreferencesPage.consentStates())['dinum-ami']) await PreferencesPage.setConsent('dinum-ami', true)
    await marquer()
    await PreferencesPage.setConsent('dinum-ami', false)
    try {
      await PreferencesPage.assertConsentWarningDisplayed()
    } catch {
      log.warn('Pas de toast d’avertissement (aucune démarche suivie ?) : démonstration poursuivie')
    }
    await waitForBackendConsent(false)
    await marquer()

    step('ii. Publier N1 par l’API partenaire, sans consentement')
    await publishNotification({title: n1, body: 'Publiée alors que le consentement est retiré', recipientFcHash: user.fcHash, checkConsent: false})

    step('iii. Inbox AVANT le consentement : N1 est-elle visible ?')
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    await NotificationsInboxPage.assertDisplayed()
    const visibleAvant = await NotificationsInboxPage.isNotificationListed(n1, 4000)
    log.info(`DÉMO — N1 visible AVANT le consentement : ${visibleAvant}`)
    await marquer()

    step('iv. Redonner le consentement AMI par l’interface')
    await openConsents()
    await PreferencesPage.setConsent('dinum-ami', true)
    await waitForBackendConsent(true)
    await marquer()

    step('v. Inbox APRÈS le consentement : N1 est-elle visible ?')
    await getAppToStartingState()
    await NotificationsInboxPage.openFromHome()
    await NotificationsInboxPage.assertDisplayed()
    const visibleApres = await NotificationsInboxPage.isNotificationListed(n1, 8000)
    log.info(`DÉMO — N1 visible APRÈS le consentement : ${visibleApres}`)
    await marquer()

    step('vi. Publier N2 avec consentement, pour comparaison')
    await publishNotification({title: n2, body: 'Publiée alors que le consentement est donné', recipientFcHash: user.fcHash})
    await NotificationsInboxPage.assertNotificationReceived(n2)
    await marquer()

    // Constat, pas assertion : S5 de consentement.test.ts le journalise sans bloquer (attente à confirmer avec Édouard).
    if (visibleApres && !visibleAvant) log.warn('ANOMALIE ? N1, publiée sans consentement, est visible une fois le consentement donné')
  })
})
