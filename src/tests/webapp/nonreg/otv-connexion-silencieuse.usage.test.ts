import {AssertionError} from 'node:assert'
import logger from '@wdio/logger'
import FranceConnectMirePage from '../../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../../pages/franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from '../../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../../pages/onboarding-zones.page'
import OnboardingNotificationsPage from '../../../pages/onboarding-notifications.page'
import HomePage from '../../../pages/home.page'
import ServicesPage from '../../../pages/services.page'
import ServicePublicPage from '../../../pages/service-public.page'
import {servicePublicLocators} from '../../../pages/locators/service-public.locators'
import {describeTarget, isBrokenTarget, isLoginWall} from '../../../helpers/webapp/link-check'
import {environmentKind} from '../../../helpers/common/environment'
import {openAppRoot} from '../../../helpers/common/session'
import {getTestUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'

const log = logger('test')

/**
 * Connexion FranceConnect silencieuse vers Service Public avec OTV (Opération Tranquillité Vacances), seule démarche joignable hors VPN.
 *
 * Hypothèse de l'équipe : la passkey conditionnerait la connexion silencieuse aux partenaires. Non confirmée : OTV s'ouvre déjà sans mire
 * FranceConnect passkey ignorée, et le jeton `caller` d'AMI ne porte rien de lié à la passkey. Ces scénarios constatent ce qui est observable sans
 * effet durable. Préprod seulement : en staging l'hôte de la démarche n'est joignable que depuis un réseau privé et l'écran passkey diffère.
 * Part d'une session vierge : `wdio.webapp.conf.ts` supprime le profil Chrome avant cette spec.
 *
 * Skippé (décision de l'équipe) : la passkey est mise de côté. Non écrits, en attente de l'équipe :
 *  - « avec passkey » : « Ajouter une clé d'accès » enregistre une passkey persistante sur le compte partagé, sans suppression connue : à jouer
 *    sur un compte dédié et jetable ; OTV doit rester silencieux.
 *  - « sans passkey, non silencieux » : seulement avec un compte sans passkey pour lequel OTV n'est pas silencieux (le constat actuel est l'inverse).
 *  - Questions : le compte partagé a-t-il une passkey ? À quoi sert-elle ? La connexion silencieuse dépend-elle de la démarche ? Quel environnement cibler ?
 */
describe.skip('Non-régression — connexion FranceConnect silencieuse vers OTV', function () {
  this.timeout(300000)

  const user = getTestUser()

  before(function () {
    if (environmentKind() !== 'preprod') {
      log.warn(`SKIPPÉ : OTV n'est joignable (hôte preprod.demarches.service-public.gouv.fr) qu'en préprod ; environnement visé : ${environmentKind()}`)
      this.skip()
    }
  })

  // Avant la connexion : après elle, une session Service Public pourrait rendre l'ouverture directe silencieuse.
  it('sans le jeton d’AMI, OTV exige de se connecter avec FranceConnect : la connexion silencieuse vient du jeton d’AMI', async function () {
    step('1. Ouvrir le formulaire OTV directement, sans le jeton d’AMI')
    const landing = await ServicePublicPage.openOtvWithoutAmiToken()

    step('2. Service Public renvoie vers sa page de connexion FranceConnect, et non vers le formulaire')
    expect(landing.host).toContain('auth')
    expect(landing.title).toContain('Se connecter avec FranceConnect')
    await ServicePublicPage.assertLoginWithFranceConnectOffered()
  })

  it('OTV s’ouvre en connexion FranceConnect silencieuse depuis AMI, même quand l’usager a ignoré la passkey', async function () {
    step('1. Revenir sur AMI (le contrôle précédent a quitté la SPA) et s’authentifier via FranceConnect (eIDAS faible)')
    await openAppRoot()
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)

    step('2. L’onboarding propose d’ajouter une clé d’accès : « Peut-être plus tard » passe à l’écran suivant sans créer de clé')
    expect(await OnboardingPasskeyPage.isVisible(15000)).toBe(true)
    await OnboardingPasskeyPage.dismiss()
    expect(await OnboardingZonesPage.isVisible(10000)).toBe(true)

    step('3. Terminer l’onboarding : l’accueil s’affiche')
    await OnboardingZonesPage.dismiss()
    await OnboardingNotificationsPage.dismiss()
    await HomePage.assertDisplayed(30000)

    step('4. Ouvrir la carte OTV du catalogue : Service Public affiche le formulaire, sans mire FranceConnect')
    await ServicesPage.open()
    await ServicesPage.assertDisplayed()
    const target = await ServicesPage.openCatalogueCardNamed(servicePublicLocators.otvCardLabel)
    // `preprod.demarches…` n'est pas un hôte à réseau privé : une page injoignable ou en erreur est un échec, jamais une tolérance.
    if (isBrokenTarget(target)) throw new AssertionError({message: `OTV : ${describeTarget(target)} répond ${target.status} (« ${target.title} »)`})
    expect(target.host).toBe('preprod.demarches.service-public.gouv.fr')
    expect(target.host).not.toContain('franceconnect')
    expect(isLoginWall(target)).toBe(false)
    await ServicePublicPage.assertIdentityProvidedByFranceConnect()

    step('5. Revenir sur Services (aucune écriture durable)')
    await ServicesPage.returnFromExternal()
  })
})
