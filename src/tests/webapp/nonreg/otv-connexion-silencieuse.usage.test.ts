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
 * Connexion FranceConnect SILENCIEUSE vers Service Public, avec OTV (Opération Tranquillité Vacances), seule démarche joignable hors VPN.
 * Réunion du 2026-10-06, 01:12–01:40 pour l'onboarding passkey : « soit tu ajoutes une clé, soit tu cliques sur peut-être plus tard et ça
 * t'amène à la suite ».
 *
 * Hypothèse de départ de l'équipe : la passkey conditionnerait la connexion silencieuse aux partenaires. NON CONFIRMÉE : exploration live du
 * 2026-10-28 (préprod, `avec_nom_dusage`, passkey ignorée) : OTV s'ouvre déjà sans mire FranceConnect, et le jeton `caller` d'AMI (claims
 * `hash_fc`, `data`) ne porte rien de lié à la passkey. Ces scénarios constatent donc ce qui est observable sans effet durable ; le lien avec la
 * passkey reste à établir (questions ouvertes ci-dessous).
 *
 * Préprod SEULEMENT : en staging l'hôte de la démarche (`qualif.demarches.service-public.gouv.fr`) n'est joignable que depuis un réseau privé,
 * et l'écran passkey diffère (3 boutons au lieu de 2).
 *
 * Part d'une session VIERGE : `wdio.webapp.conf.ts` supprime le profil Chrome avant cette spec (comme pour authentification.smoke.test.ts).
 *
 * NON ÉCRITS, en attente de l'équipe :
 *  - TODO « avec passkey » : « Ajouter une clé d'accès » ENREGISTRE UNE PASSKEY PERSISTANTE sur le compte de test partagé (authentificateur
 *    virtuel côté navigateur, mais credential déclaré au backend) ; aucune suppression connue (ni UI, ni API). À jouer sur un compte dédié et
 *    jetable, avec accord de l'équipe ; puis OTV doit rester silencieux comme ci-dessous.
 *  - TODO « sans passkey, non silencieux » : à formuler seulement si l'équipe fournit un compte dont on SAIT qu'il n'a pas de passkey et pour
 *    lequel OTV n'est pas silencieux (le constat actuel est l'inverse).
 *  - Questions : le compte partagé a-t-il déjà une passkey côté backend ? À quoi sert la passkey (le bouton « Utiliser une clé d'accès
 *    existante » de staging suggère une connexion par passkey) ? La silencieuse dépend-elle de la démarche (« Déclaration de changement
 *    d'adresse » aboutit sur une page de connexion, cf. demarche-detail.parcours) ? Quel environnement cibler ?
 */
// SKIP (décision de l'équipe, 2026-10-28) : la passkey est mise de côté pour le moment. Les deux scénarios passaient en préprod
// (2 passing, 3 min 47) ; les retirer d'ici pour les rejouer, avec les réponses aux questions ci-dessus.
describe.skip('Non-régression — connexion FranceConnect silencieuse vers OTV', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(300000)

  const user = getTestUser()

  before(function () {
    if (environmentKind() !== 'preprod') {
      log.warn(`SKIPPÉ : OTV n'est joignable (hôte preprod.demarches.service-public.gouv.fr) qu'en préprod ; environnement visé : ${environmentKind()}`)
      this.skip()
    }
  })

  // Placé AVANT la connexion : après elle, une session Service Public pourrait rendre l'ouverture directe silencieuse et fausser le contrôle.
  it('sans le jeton d’AMI, OTV exige de se connecter avec FranceConnect : la connexion silencieuse vient du jeton d’AMI', async function () {
    step('1. Ouvrir le formulaire OTV directement, sans le jeton d’AMI')
    const landing = await ServicePublicPage.openOtvWithoutAmiToken()
    log.info(`OTV sans jeton : ${describeTarget(landing)} (« ${landing.title} »)`)

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
    await HomePage.assertHomeVisible(30000)

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
