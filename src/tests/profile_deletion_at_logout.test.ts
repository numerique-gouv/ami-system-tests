import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../pages/home.page'
import ProfilePage from '@pages/avatar-menu.page'
import { authenticate } from '@helpers/authenticate'

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le logout déclenche la suppression côté app — le after() restaure en cas d'échec avant logout.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
  addressQuery: '20 avenue de Ségur Paris',
}

describe('Profil usager — suppression des modifications au déconnexion', () => {
  // Données initiales capturées dynamiquement — non codées en dur.
  // Initialisées dans le before() pour refléter l'état réel du compte au moment du test.
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour restauration after()
    email: string
    addressBolds: string[]
  }

  before(async () => {
    await AllureReporter.addFeature('Profil usager — suppression au logout')
    await AllureReporter.addSeverity('critical')

    if (!await HomePage.isHomeReachable(1000)) {
      console.warn("You are not home, let's authenticate")
      await authenticate()
    } else console.warn("You are home, and laready authenticated")

    await AllureReporter.addStep('Naviguer vers Mon profil')
    await ProfilePage.navigate()

    await AllureReporter.addStep('Capturer les données initiales du profil')
    const identityBolds = await ProfilePage.getIdentityBolds()
    const displayName = identityBolds[0] ?? ''
    const preferredUsername = displayName.replace(/^.+?\s/, '').replace(/,$/, '').trim()
    original = {
      identityBolds,
      preferredUsername,
      email: await ProfilePage.getEmailBold(),
      addressBolds: await ProfilePage.getAddressBolds(),
    }
  })

  after(async () => {
    // Restauration best-effort : protège le compte si le test échoue avant le logout.
    // Sans cela, les données modifiées resteraient et pollueraient les runs suivants.
    if (!original) return
    const restoreAddressQuery = original.addressBolds.filter(Boolean).join(' ')
    try { await ProfilePage.navigateToProfileDirect() } catch { /* silencieux */ }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch { /* silencieux */ }
    try { await ProfilePage.editEmail(original.email) } catch { /* silencieux */ }
    try { await ProfilePage.editAddress(restoreAddressQuery) } catch { /* silencieux */ }
  })

  it('modifie le nom d\'usage', async () => {
    await AllureReporter.addStep('Modifier le nom d\'usage')
    await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds.some(b => b.includes(MODIFICATIONS.preferredUsername))).toBe(true)
  })

  it('modifie l\'email', async () => {
    await AllureReporter.addStep('Modifier l\'email')
    await ProfilePage.editEmail(MODIFICATIONS.email)

    expect(await ProfilePage.getEmailBold()).toBe(MODIFICATIONS.email)
  })

  it('modifie l\'adresse', async () => {
    await AllureReporter.addStep('Modifier l\'adresse via autocomplétion BAN')
    await ProfilePage.editAddress(MODIFICATIONS.addressQuery)

    const bolds = await ProfilePage.getAddressBolds()
    expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(true)
  })

  it('se déconnecte via le menu avatar', async () => {
    await AllureReporter.addStep('Taper Me déconnecter depuis le menu avatar')
    await HomePage.isHomeReachable()
    await ProfilePage.logout()
  })

  it('se reconnecte avec le même compte', async () => {
    await AllureReporter.addStep('Lancer le flow FranceConnect')
    await authenticate()
    
    await AllureReporter.addStep('Naviguer vers Mon profil')
    await ProfilePage.navigate()
  })

  it('affiche les données d\'identité originales (pas les valeurs modifiées)', async () => {
    await AllureReporter.addStep('Vérifier que le nom d\'usage est restauré')
    const bolds = await ProfilePage.getIdentityBolds()
    for (const expected of original.identityBolds) {
      expect(bolds).toContain(expected)
    }
    expect(bolds.some(b => b.includes(MODIFICATIONS.preferredUsername))).toBe(false)
  })

  it('affiche l\'email original (pas la valeur modifiée)', async () => {
    await AllureReporter.addStep('Vérifier que l\'email est restauré')
    const email = await ProfilePage.getEmailBold()
    expect(email).toBe(original.email)
    expect(email).not.toBe(MODIFICATIONS.email)
  })

  it('affiche l\'adresse originale (pas la valeur modifiée)', async () => {
    await AllureReporter.addStep('Vérifier que l\'adresse est restaurée')
    const bolds = await ProfilePage.getAddressBolds()
    for (const expected of original.addressBolds) {
      expect(bolds).toContain(expected)
    }
    expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(false)
  })
})
