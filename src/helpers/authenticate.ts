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
  await LoginPage.reviewEnvironmentPicker()
  await LoginPage.tapFranceConnect()
  await FranceConnectPage.loginWithSandbox(user)
  await OnboardingNotificationsPage.dismiss()
  // Sur iOS, le bouton FC peut réapparaître brièvement pendant la fin du redirect OIDC
  try { await LoginPage.tapFranceConnect(1000) } catch { /* cas normal — bouton absent */ }
  const ready = await HomePage.isHomeVisible(60000)
  if (!ready) throw new Error("La page d'accueil n'est pas visible après authentification")
}
