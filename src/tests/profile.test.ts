import AllureReporter from '@wdio/allure-reporter'
import LoginPage from '../pages/login.page'
import FranceConnectPage from '../pages/franceconnect.page'
import OnboardingNotificationsPage from '../pages/onboarding-notifications.page'
import HomePage from '../pages/home.page'
import ProfilePage from '../pages/profile.page'
import { getUser } from '../helpers/test-users'
import {authenticate} from "@helpers/authenticate";

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
  // nom d'usage extrait du displayName pour la restauration après modification
  preferredUsername: 'DUBOIS',
}

// Valeurs temporaires utilisées uniquement pendant les tests de modification.
// Le hook after() restaure les valeurs d'origine après chaque passage.
const MODIFICATIONS = {
  preferredUsername: 'TESTUSAGE',
  email: 'test-modification@yopmail.com',
  addressQuery: '3 Rue de Rivoli Paris',
  restoreAddressQuery: 'Montorgueil Paris',
}

describe('Profil usager — vérification des données (Mon profil)', () => {
  const user = getUser('avec_nom_dusage')

  before(async () => {
    await AllureReporter.addFeature('Profil usager')
    await AllureReporter.addSeverity('normal')

    if (!await HomePage.isHomeReachable()) {
      await authenticate()
    }
    
    await AllureReporter.addStep('Naviguer vers Mon profil depuis le menu avatar')
    await ProfilePage.navigate()
  })

  after(async () => {
    // Restauration best-effort : chaque étape est indépendante pour éviter
    // qu'un échec partiel laisse le compte dans un état incohérent.
    try { await ProfilePage.navigateToProfileDirect() } catch { /* silencieux */ }
    try { await ProfilePage.editPreferredUsername(EXPECTED.preferredUsername) } catch { /* silencieux */ }
    try { await ProfilePage.editEmail(EXPECTED.email) } catch { /* silencieux */ }
    try { await ProfilePage.editAddress(MODIFICATIONS.restoreAddressQuery) } catch { /* silencieux */ }
  })

  it('affiche le nom affiché et le nom de naissance dans la section "Mon identité" ainsi que la date et le lieu de naissance', async () => {
    await AllureReporter.addStep('Vérifier les données d\'identité')
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds).toContain(EXPECTED.displayName)
    expect(bolds).toContain(EXPECTED.birthName)
    await AllureReporter.addStep('Vérifier date et lieu de naissance')
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

  it('permet de modifier le nom d\'usage dans le bloc "Mon identité"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir le nouveau nom d\'usage')
    await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

    await AllureReporter.addStep('Vérifier que le nouveau nom d\'usage est affiché dans le profil')
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds).toContain(`Pierre ${MODIFICATIONS.preferredUsername},`)
  })

  it('permet de modifier l\'adresse dans le bloc "Mon adresse"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir la nouvelle adresse via l\'autocomplétion BAN')
    await ProfilePage.editAddress(MODIFICATIONS.addressQuery)

    await AllureReporter.addStep('Vérifier que la nouvelle adresse apparaît dans le profil')
    const bolds = await ProfilePage.getAddressBolds()
    expect(bolds.some(b => b.toLowerCase().includes('rivoli'))).toBe(true)
  })

  it('permet de modifier l\'email dans le bloc "Contact"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir le nouvel email')
    await ProfilePage.editEmail(MODIFICATIONS.email)

    await AllureReporter.addStep('Vérifier que le nouvel email est affiché dans le profil')
    const email = await ProfilePage.getEmailBold()
    expect(email).toBe(MODIFICATIONS.email)
  })
})
