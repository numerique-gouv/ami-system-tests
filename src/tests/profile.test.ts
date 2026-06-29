import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import ProfilePage from '../pages/profile.page'
import { getUser } from '../helpers/test-users'

// Données attendues pour le compte "avec_nom_dusage" — vérifiées sur l'app staging le 2026-06-29.
// Identité fournie par FranceConnect, adresse fournie par la Caf.
const EXPECTED = {
  displayName: 'Pierre DUBOIS,',
  birthName: 'MERCIER',
  birthDate: '17/03/1969',
  birthPlace: 'Gonesse (95) France',
  email: 'ymmyffarapp-1777@yopmail.com',
  street: 'Rue Montorgueil',
  cityPostal: '75002 Paris',
}

describe('Profil usager — vérification des données (Mon profil)', () => {
  const user = getUser('avec_nom_dusage')

  before(async () => {
    await AllureReporter.addFeature('Profil usager')
    await AllureReporter.addSeverity('normal')

    await LoginPage.reviewEnvironmentPicker()
    await LoginPage.tapFranceConnect()
    await FranceConnectPage.loginWithSandbox(user)
    await OnboardingNotificationsPage.dismiss()
    try {
      await LoginPage.tapFranceConnect(1000)
    } catch { /* absent dans la majorité des cas */ }
    const ready = await HomePage.isHomeVisible(60000)
    if (!ready) throw new Error('SPA home non prête après 60s')

    await AllureReporter.addStep('Naviguer vers Mon profil depuis le menu avatar')
    await ProfilePage.navigate()
  })

  it('affiche le nom affiché et le nom de naissance dans la section "Mon identité"', async () => {
    await AllureReporter.addStep('Vérifier les données d\'identité')
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds).toContain(EXPECTED.displayName)
    expect(bolds).toContain(EXPECTED.birthName)
  })

  it('affiche la date et le lieu de naissance dans la section "Mon identité"', async () => {
    await AllureReporter.addStep('Vérifier date et lieu de naissance')
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds).toContain(EXPECTED.birthDate)
    expect(bolds).toContain(EXPECTED.birthPlace)
  })

  it('affiche l\'adresse email dans la section "Contact"', async () => {
    await AllureReporter.addStep('Vérifier l\'adresse email')
    const email = await ProfilePage.getEmailBold()
    expect(email).toBe(EXPECTED.email)
  })

  it('affiche la rue et le code postal dans la section "Mon adresse"', async () => {
    await AllureReporter.addStep('Vérifier l\'adresse postale')
    const bolds = await ProfilePage.getAddressBolds()
    expect(bolds).toContain(EXPECTED.street)
    expect(bolds).toContain(EXPECTED.cityPostal)
  })
})
