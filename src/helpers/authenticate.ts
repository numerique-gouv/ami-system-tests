import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import {getUser} from './test-users'
import {AssertionError} from "node:assert";

/**
 * Flow d'authentification complet, sans step Allure.
 * À utiliser dans les before() des suites qui nécessitent un état authentifié.
 *
 * Toujours avec le compte 'avec_nom_dusage' en eIDAS faible.
 * Throws si la home n'est pas visible dans les 60 s post-login.
 */
export async function authenticate(alreadyStarted = false): Promise<void> {
  const user = getUser('avec_nom_dusage')
  if (!alreadyStarted) {
    await LoginPage.reviewEnvironmentPicker()
  }
  await LoginPage.tapFranceConnect()
  if (!await FranceConnectPage.selectEidasFaible()) {
    await FranceConnectPage.fillCredentials(user)
  }
  await OnboardingNotificationsPage.dismiss()
  // Sur iOS, le bouton FC peut réapparaître brièvement pendant la fin du redirect OIDC
  await LoginPage.tapFranceConnect(true)
  if (!await HomePage.isHomeVisible(30000)) {
    throw new AssertionError({ message: "La page d'accueil n'est pas visible après authentification" })
  }
}
