import FranceConnectMirePage from '../../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../../pages/franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from '../../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../../pages/onboarding-zones.page'
import OnboardingNotificationsPage from '../../../pages/onboarding-notifications.page'
import HomePage from '../../../pages/home.page'
import {getUser} from '../../../helpers/common/test-users'
import {step} from '../../../helpers/reporting/report'

/**
 * Onboarding passkey (plan : passkey.md, scénario S11). Réunion du 2026-10-06, 01:12–01:40 : « soit tu ajoutes une clé, soit tu
 * cliques sur peut-être plus tard et ça t'amène à la suite ».
 *
 * Part d'une session VIERGE : `wdio.webapp.conf.ts` supprime le profil Chrome avant cette spec (comme pour authentification.smoke.test.ts).
 */
describe('Non-régression — onboarding passkey', function () {
  // Délai posé ICI et non dans le corps du test : WDIO fixe son propre délai d'après le délai du test AVANT de l'exécuter
  // (@wdio/utils, executeAsync), un `this.timeout()` écrit dans un `it` ou un hook arrive trop tard et reste à 120 s.
  this.timeout(300000)

  const user = getUser('avec_nom_dusage')

  it('S11.1 — « Peut-être plus tard » passe à l’écran suivant sans créer de clé', async function () {
    step('1. S’authentifier via FranceConnect (eIDAS faible)')
    await FranceConnectMirePage.tapFranceConnect(false)
    await FranceConnectEidasPage.selectEidasFaible()
    await FranceConnectCredentialsPage.fillCredentials(user)

    step('2. L’onboarding propose d’ajouter une clé d’accès')
    expect(await OnboardingPasskeyPage.isVisible(15000)).toBe(true)

    step('3. « Peut-être plus tard » mène à l’écran suivant (zones scolaires)')
    await OnboardingPasskeyPage.dismiss()
    expect(await OnboardingZonesPage.isVisible(10000)).toBe(true)

    step('4. Terminer l’onboarding : l’accueil s’affiche')
    await OnboardingZonesPage.dismiss()
    await OnboardingNotificationsPage.dismiss()
    await HomePage.assertHomeVisible(30000)
  })

  // « Ajouter une clé » ENREGISTRE UNE PASSKEY PERSISTANTE sur le compte de test partagé (authentificateur virtuel côté navigateur,
  // mais credential déclaré au backend). Aucune suppression n'est connue dans l'UI, et la route `/passkey-authentication` pourrait
  // changer la connexion de toutes les autres specs. À jouer sur un compte dédié, avec accord de l'équipe : non exécuté (cf. passkey.md).
  it.skip('S11.2 — « Ajouter une clé » crée une passkey et passe à l’écran suivant', async () => {
    // Se déconnecter puis se reconnecter via FranceConnect jusqu'à l'écran passkey
    // Cliquer « Ajouter une clé d'accès »
    // Vérifier qu'une credential existe dans l'authentificateur virtuel
    // Vérifier que l'écran suivant de l'onboarding s'affiche
  })
})
