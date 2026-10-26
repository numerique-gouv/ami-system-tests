import logger from '@wdio/logger'
import FranceConnectMirePage from '../../../pages/franceconnect/franceconnect-mire.page'
import FranceConnectEidasPage from '../../../pages/franceconnect/franceconnect-eidas.page'
import FranceConnectCredentialsPage from '../../../pages/franceconnect/franceconnect-credentials.page'
import OnboardingPasskeyPage from '../../../pages/onboarding-passkey.page'
import OnboardingZonesPage from '../../../pages/onboarding-zones.page'
import OnboardingNotificationsPage from '../../../pages/onboarding-notifications.page'
import HomePage from '../../../pages/home.page'
import {getAppToLoggedOutState} from '../../../pages/authenticate.process'
import {getUser, type FcLogin} from '../../../helpers/test-users'
import {step} from '../../../helpers/report'

const log = logger('test')

/**
 * Logins NON ASCII de la maquette FranceConnect (accents, œ, æ) : la saisie dans le champ « Identifiant » ne doit être ni refusée ni
 * altérée par l'outil de test (sinon `NonAsciiLoginInputError`, cf. franceconnect-credentials.page.ts), et l'authentification doit
 * aboutir à l'Accueil. L'identité affichée n'est PAS comparée au compte (nom d'usage, naissance à l'étranger : comportements propres
 * à la maquette) : elle est seulement journalisée.
 */
const LOGINS: FcLogin[] = ['nom_composé', 'prénom_composé', 'carac_speciaux', 'naissance_Algérie']

describe('Non-régression — authentification avec un login non ASCII', function () {
  this.timeout(240000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe

  after(async function () {
    // Le dernier login reste connecté : les specs suivantes attendent `avec_nom_dusage` (getAppToStartingState réutilise la session ouverte).
    await getAppToLoggedOutState()
  })

  for (const key of LOGINS) {
    it(`s'authentifie avec le login « ${key} »`, async function () {
      const user = getUser(key)

      step('1. Partir de l\'écran de connexion (déconnecté)')
      await getAppToLoggedOutState()

      step(`2. Parcourir FranceConnect (eIDAS faible) en saisissant « ${user.login} »`)
      await FranceConnectMirePage.tapFranceConnect(false)
      await FranceConnectEidasPage.selectEidasFaible()
      await FranceConnectCredentialsPage.fillCredentials(user)

      step("3. Passer les écrans d'onboarding présents")
      await OnboardingPasskeyPage.dismiss()
      await OnboardingZonesPage.dismiss()
      await OnboardingNotificationsPage.dismiss()

      step("4. L'Accueil est affiché")
      await HomePage.assertHomeVisible(30000)
      const greeting = await HomePage.greeting()
      log.info(`Login « ${user.login} » : accueil affiché, salutation « ${greeting} »`)
      expect(greeting).toMatch(/^Bonjour \S+/)
    })
  }
})
