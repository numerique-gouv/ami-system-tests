import HomePage from '../../../pages/home.page'
import NavigationPage from '../../../pages/navigation.page'
import SuiviDemarchesPage from '../../../pages/suivi-demarches.page'
import DemarcheDetailPage from '../../../pages/demarche-detail.page'
import NotificationsInboxPage from '../../../pages/notifications.page'
import ServicesPage from '../../../pages/services.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {getBackendUrl, PARTNER_AMI, grantDemarchesConsent, publishDemarche, publishDemarcheEnfant} from '../../../helpers/partner-api'
import {describeTarget, isBrokenTarget, isExpectedUnreachable, isLoginWall, toleratedUnreachableWarning} from '../../../helpers/webapp/link-check'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'
import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'

const log = logger('test')

/**
 * Redirections vers le détail d'une démarche (plan : demarche-detail.md, scénarios S9, S12, S13). Réunion du 2026-10-06,
 * 09:49–12:39 et 57:38 : « avant, ça ramenait à la liste, maintenant ça ramène à l'item ». Assertion clé : la référence dossier
 * publiée est retrouvée sur l'écran de détail atteint.
 *
 * Les démarches sont créées par la spec (titre horodaté) : rien à restaurer.
 */
describe('Non-régression — détail d’une démarche', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(300000)

  const user = getTestUser()
  const stamp = new Date().toISOString()
  const itemId = `E2E-detail-${stamp}`
  const title = `Demarche E2E ${itemId} detail`

  before(async function () {
    await getAppToStartingState()
    await grantDemarchesConsent(PARTNER_AMI, user.fcHash)
    await publishDemarche({
      title, body: 'Démarche de non-régression', recipientFcHash: user.fcHash,
      contentLink: `${getBackendUrl()}/demarches/${itemId}/v1`,
      itemType: 'OTV', itemId, status: 'wip',
    })
    // Le Suivi n'a pas d'abonnement temps réel : on attend que la démarche y soit avant les scénarios.
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(title)
  })

  beforeEach(async function () {
    await getAppToStartingState()
  })

  it('depuis l’Accueil puis depuis le Suivi, la tuile ouvre le détail de la bonne démarche, et le retour revient à l’écran d’origine', async function () {
    step('1. Depuis l’Accueil : ouvrir le détail, puis le retour revient à l’Accueil')
    await HomePage.assertHomeVisible()
    await SuiviDemarchesPage.ouvreDemarche(title)
    await DemarcheDetailPage.assertDisplayed(title)
    await DemarcheDetailPage.assertReference(itemId)
    await NavigationPage.goBack()
    await HomePage.assertHomeVisible(15000)

    step('2. Depuis le Suivi : ouvrir le détail, puis le retour revient à la liste')
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(title)
    await SuiviDemarchesPage.ouvreDemarche(title)
    await DemarcheDetailPage.assertDisplayed(title)
    await DemarcheDetailPage.assertReference(itemId)
    await NavigationPage.goBack()
    await SuiviDemarchesPage.assertDisplayed()
  })

  it('depuis une notification, on arrive sur le détail de la démarche (et non sur la liste du Suivi)', async function () {
    await NotificationsInboxPage.openFromHome()
    await NotificationsInboxPage.assertDisplayed()
    await NotificationsInboxPage.assertNotificationReceived(title)
    await NotificationsInboxPage.clickNotification(title)
    await DemarcheDetailPage.assertDisplayed(title)
    await DemarcheDetailPage.assertReference(itemId)
  })

  it('la carte « Déclaration de changement d’adresse » ne passe pas par la mire FranceConnect (connexion silencieuse)', async function () {
    // ASSERTION PROPOSÉE, À VALIDER avec Édouard (demarche-detail.md) : seule la page FINALE est observée, pas les redirections.
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const target = await ServicesPage.openCatalogueCardNamed('Déclaration de changement d')
    // Cible non différée (`deferExternal`) : son adresse porte un jeton à usage unique, que seul le navigateur peut suivre ; l'attente du
    // délai de connexion de Chrome (~75-90 s) quand l'hôte qualif est injoignable ne peut donc pas être évitée par un contrôle HTTP.
    if (isBrokenTarget(target)) {
      const line = `Connexion silencieuse : ${describeTarget(target)} répond ${target.status} (« ${target.title} »)`
      // Seul un hôte listé (`PRIVATE_NETWORK_HOSTS`) SANS réponse est toléré ; une page d'erreur d'AMI ou un autre hôte reste un échec.
      if (!isExpectedUnreachable(target)) throw new AssertionError({message: line})
      log.warn(toleratedUnreachableWarning(line))
      await ServicesPage.returnFromExternal()
      return
    }
    expect(target.host).not.toContain('franceconnect')
    // Constat du 2026-10-15 en préprod : la cible est « Se connecter | Service Public » (200), la connexion silencieuse n'aboutit pas.
    // Ce n'est pas encore un critère d'échec (non confirmé : désactivée ou en échec ?) : signalé, pas bloquant.
    if (isLoginWall(target)) log.warn(`ANOMALIE ? La connexion silencieuse aboutit sur une page de connexion (${describeTarget(target)}, « ${target.title} »)`)
    await ServicesPage.returnFromExternal()
  })

  it('une démarche enfant est listée sous sa démarche parente, et pas sous une autre', async function () {
    // ASSERTION PROPOSÉE, À VALIDER avec Édouard (rattachement des sous-démarches, demarche-detail.md).
    const parent = {title: `Demarche E2E ${itemId} parent`, id: `${itemId}-P`}
    // « Autre » démarche : celle du `before()`, déjà vérifiée visible dans le Suivi. Une démarche publiée dans la foulée du parent
    // n'apparaissait pas dans la fenêtre de 30 s de `waitForDemarche` (relevé le 2026-10-15), d'où ce choix.
    const other = {title, id: itemId}
    const childTitle = `Sous-demarche E2E ${itemId}`

    step('1. Publier un parent et un enfant rattaché au parent')
    await publishDemarche({title: parent.title, body: 'Parent', recipientFcHash: user.fcHash, itemType: 'OTV', itemId: parent.id, status: 'wip'})
    await publishDemarcheEnfant({
      title: `Enfant ${itemId}`, subheading: childTitle, body: 'Enfant', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId: `${itemId}-E`, status: 'wip', parent: {type: 'OTV', id: parent.id},
    })

    step('2. Le détail du parent liste l’enfant')
    // Recharge la racine APRÈS les publications : un clic sur l'onglet « Suivi » pendant que l'Accueil se re-rend était perdu.
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(parent.title)
    await SuiviDemarchesPage.ouvreDemarche(parent.title)
    await DemarcheDetailPage.assertDisplayed(parent.title)
    await DemarcheDetailPage.assertChildListed(childTitle)

    step('3. Le détail d’une autre démarche ne le liste pas')
    // Repart de la racine plutôt que d'un retour arrière : après `goBack`, la tuile de l'autre démarche n'était plus affichée au bout de
    // 20 s (relevé le 2026-10-15) — la liste du Suivi ne se ré-hydrate pas de façon fiable à cet endroit.
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(other.title)
    await SuiviDemarchesPage.ouvreDemarche(other.title)
    await DemarcheDetailPage.assertDisplayed(other.title)
    expect(await DemarcheDetailPage.hasChild(childTitle)).toBe(false)
  })
})
