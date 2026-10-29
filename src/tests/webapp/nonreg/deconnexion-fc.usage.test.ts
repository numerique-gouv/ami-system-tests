import logger from '@wdio/logger'
import ServicesPage from '../../../pages/services.page'
import HomePage from '../../../pages/home.page'
import FranceConnectDemoSpPage from '../../../pages/franceconnect/franceconnect-demo-sp.page'
import {getAppToStartingState} from '../../../pages/authenticate.process'
import {environmentKind} from '../../../helpers/common/environment'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/**
 * « Déconnexion FranceConnect », outil de test du catalogue de staging : la carte ouvre, dans l'onglet courant, le fournisseur de service de
 * démonstration FranceConnect. Sa page « Login Callback » propose « Se déconnecter », qui déconnecte de FranceConnect (une nouvelle connexion
 * repasse par le choix du compte) et ramène sur la page de connexion du démonstrateur, pas sur AMI. La session AMI n'est pas touchée.
 * Sauté hors staging (la carte n'existe pas ailleurs, non confirmé pour la préprod et les review apps). Le test rouvre ensuite la session
 * FranceConnect (connexion complète depuis le démonstrateur), puis revient sur AMI.
 */
describe('Non-régression — déconnexion FranceConnect (staging)', function () {
  this.timeout(300000)

  before(async function () {
    if (environmentKind() !== 'staging') {
      log.warn(`ENV3 sauté : la carte « Déconnexion FC » n'existe que sur staging (environnement courant : ${environmentKind()})`)
      this.skip()
    }
    await getAppToStartingState()
  })

  it('ENV3 — la carte « Déconnexion FC » déconnecte de FranceConnect sans déconnecter d’AMI', async function () {
    step('1. Ouvrir la carte « Déconnexion FC » du catalogue')
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const target = await ServicesPage.openCatalogueCardContaining('Déconnexion FC')
    expect(target.internal).toBe(false)
    await FranceConnectDemoSpPage.assertLoginDisplayed()

    step('2. Se connecter à FranceConnect depuis le démonstrateur : la session FC est ouverte (consentement direct)')
    await FranceConnectDemoSpPage.connect()
    expect(await FranceConnectDemoSpPage.isConsentShown()).toBe(true)
    await FranceConnectDemoSpPage.consentAndWaitCallback()

    step('3. Se déconnecter')
    await FranceConnectDemoSpPage.logout()

    step('4. Une nouvelle connexion repasse par le choix du compte : la session FranceConnect a été retirée')
    await FranceConnectDemoSpPage.connect()
    expect(await FranceConnectDemoSpPage.isAccountChooserShown()).toBe(true)

    step('5. Restauration : rouvrir la session FranceConnect, puis revenir sur AMI (session AMI intacte)')
    await FranceConnectDemoSpPage.signInFromAccountChooser(getTestUser())
    await getAppToStartingState()
    expect(await HomePage.isHomeDisplayed(10000)).toBe(true)
  })
})
