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
 * Redirections vers le détail d'une démarche. Assertion clé : la référence dossier publiée est retrouvée sur l'écran de détail atteint.
 * Les démarches sont créées par la spec (titre horodaté) : rien à restaurer.
 */
describe('Non-régression — détail d’une démarche', function () {
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
    // Assertion à valider avec l'équipe : seule la page finale est observée, pas les redirections.
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const target = await ServicesPage.openCatalogueCardNamed('Déclaration de changement d')
    // Cible non différée : son adresse porte un jeton à usage unique que seul le navigateur peut suivre (sans contrôle HTTP, l'attente de Chrome sur un hôte injoignable ~75-90 s est inévitable).
    if (isBrokenTarget(target)) {
      const line = `Connexion silencieuse : ${describeTarget(target)} répond ${target.status} (« ${target.title} »)`
      // Seul un hôte listé (`PRIVATE_NETWORK_HOSTS`) SANS réponse est toléré ; une page d'erreur d'AMI ou un autre hôte reste un échec.
      if (!isExpectedUnreachable(target)) throw new AssertionError({message: line})
      log.warn(toleratedUnreachableWarning(line))
      await ServicesPage.returnFromExternal()
      return
    }
    expect(target.host).not.toContain('franceconnect')
    // Page de connexion (200) : la connexion silencieuse n'aboutit pas. Pas encore un critère d'échec (désactivée ou en échec, non confirmé).
    if (isLoginWall(target)) log.warn(`ANOMALIE ? La connexion silencieuse aboutit sur une page de connexion (${describeTarget(target)}, « ${target.title} »)`)
    await ServicesPage.returnFromExternal()
  })

  it('une démarche enfant est listée sous sa démarche parente, et pas sous une autre', async function () {
    // Assertion à valider avec l'équipe (rattachement des sous-démarches).
    const parent = {title: `Demarche E2E ${itemId} parent`, id: `${itemId}-P`}
    // « Autre » démarche : celle du `before()`, déjà visible dans le Suivi (une démarche publiée dans la foulée du parent n'apparaît pas toujours sous 30 s).
    const other = {title, id: itemId}
    const childTitle = `Sous-demarche E2E ${itemId}`

    step('1. Publier un parent et un enfant rattaché au parent')
    await publishDemarche({title: parent.title, body: 'Parent', recipientFcHash: user.fcHash, itemType: 'OTV', itemId: parent.id, status: 'wip'})
    await publishDemarcheEnfant({
      title: `Enfant ${itemId}`, subheading: childTitle, body: 'Enfant', recipientFcHash: user.fcHash,
      itemType: 'OTV', itemId: `${itemId}-E`, status: 'wip', parent: {type: 'OTV', id: parent.id},
    })

    step('2. Le détail du parent liste l’enfant')
    // Racine rechargée après les publications : un clic sur « Suivi » pendant le re-rendu de l'Accueil serait perdu.
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(parent.title)
    await SuiviDemarchesPage.ouvreDemarche(parent.title)
    await DemarcheDetailPage.assertDisplayed(parent.title)
    await DemarcheDetailPage.assertChildListed(childTitle)

    step('3. Le détail d’une autre démarche ne le liste pas')
    // Repart de la racine plutôt que d'un retour arrière : la liste du Suivi ne se ré-hydrate pas de façon fiable après `goBack`.
    await getAppToStartingState()
    await HomePage.ouvreSuivi()
    await SuiviDemarchesPage.assertDisplayed()
    await SuiviDemarchesPage.waitForDemarche(other.title)
    await SuiviDemarchesPage.ouvreDemarche(other.title)
    await DemarcheDetailPage.assertDisplayed(other.title)
    expect(await DemarcheDetailPage.hasChild(childTitle)).toBe(false)
  })
})
