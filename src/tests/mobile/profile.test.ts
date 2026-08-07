import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../../pages/home.page'
import ProfilePage from '@pages/profile.page'
import { authenticate } from '@helpers/authenticate'

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le hook after() restaure les valeurs d'origine après chaque passage.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
  addressQuery: '20 avenue de Ségur Paris',
}

describe('Profil usager — vérification des données (Mon profil)', () => {
  // Données initiales capturées dynamiquement en before() — résistantes aux changements de compte.
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour la restauration after()
    email: string
    addressBolds: string[]
  }

  before(async () => {
    await AllureReporter.addFeature('Profil usager')
    await AllureReporter.addSeverity('normal')

    if (!await HomePage.isHomeReachable(1000)) {
      await authenticate()
    }

    await AllureReporter.addStep('Naviguer vers Mon profil depuis le menu avatar')
    await ProfilePage.navigate()

    await AllureReporter.addStep('Capturer les données initiales du profil')
    const identityBolds = await ProfilePage.getIdentityBolds()
    // Format attendu du premier bold : "Prénom NOM_USAGE," → extraire NOM_USAGE
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
    // Restauration best-effort : chaque étape est indépendante pour éviter
    // qu'un échec partiel laisse le compte dans un état incohérent.
    if (!original) return
    const restoreAddressQuery = original.addressBolds.filter(Boolean).join(' ')
    try { await ProfilePage.navigateToProfileDirect() } catch { /* silencieux */ }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch { /* silencieux */ }
    try { await ProfilePage.editEmail(original.email) } catch { /* silencieux */ }
    try { await ProfilePage.editAddress(restoreAddressQuery) } catch { /* silencieux */ }
  })

  it('permet de modifier le nom d\'usage dans le bloc "Mon identité"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir le nouveau nom d\'usage')
    await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

    await AllureReporter.addStep('Vérifier que le nouveau nom d\'usage est affiché dans le profil')
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds.some(b => b.includes(MODIFICATIONS.preferredUsername))).toBe(true)
  })

  it('permet de modifier l\'adresse dans le bloc "Mon adresse"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir la nouvelle adresse via l\'autocomplétion BAN')
    await ProfilePage.editAddress(MODIFICATIONS.addressQuery)

    await AllureReporter.addStep('Vérifier que la nouvelle adresse apparaît dans le profil')
    const bolds = await ProfilePage.getAddressBolds()
    expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(true)
  })

  it('permet de modifier l\'email dans le bloc "Contact"', async () => {
    await AllureReporter.addStep('Cliquer Modifier et saisir le nouvel email')
    await ProfilePage.editEmail(MODIFICATIONS.email)

    await AllureReporter.addStep('Vérifier que le nouvel email est affiché dans le profil')
    const email = await ProfilePage.getEmailBold()
    expect(email).toBe(MODIFICATIONS.email)
  })
})
