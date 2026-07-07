import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import { getUser } from './test-users'

/**
 * Flow d'authentification complet, sans step Allure.
 * À utiliser dans les before() des suites qui nécessitent un état authentifié.
 *
 * Toujours avec le compte 'avec_nom_dusage' en eIDAS faible.
 * Throws si la home n'est pas visible dans les 60 s post-login.
 */
export async function authenticate(): Promise<void> {
  const user = getUser('avec_nom_dusage')
  console.warn('[authenticate] reviewEnvironmentPicker')
  await LoginPage.reviewEnvironmentPicker()
  console.warn('[authenticate] tapFranceConnect')
  await LoginPage.tapFranceConnect()
  console.warn('[authenticate] loginWithSandbox')
  await FranceConnectPage.loginWithSandbox(user)
  console.warn('[authenticate] dismiss onboarding notifications')
  await OnboardingNotificationsPage.dismiss()
  // Sur iOS, le bouton FC peut réapparaître brièvement pendant la fin du redirect OIDC
  console.warn('[authenticate] tapFranceConnect (retry iOS OIDC redirect)')
  await LoginPage.tapFranceConnect(true)
  console.warn('[authenticate] isHomeVisible')
  const ready = await HomePage.isHomeVisible(30000)
  if (!ready) throw new Error("La page d'accueil n'est pas visible après authentification")
}
