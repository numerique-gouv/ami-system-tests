import AllureReporter from '@wdio/allure-reporter'
import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '@pages/authenticate.process'

// Valeur clairement identifiable comme donnée de test. Le logout supprime les données saisies dans
// l'app (modale « Suppression de vos données ») : la reconnexion doit retrouver les données d'origine.
const MODIFIED_PREFERRED_USERNAME = 'NOMTEST'

describe('Déconnexion', () => {
  let original: {identityBolds: string[]; preferredUsername: string}

  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Authentification')
    await AllureReporter.addFeature('Déconnexion')
    await AllureReporter.addSeverity('critical')
    await AllureReporter.addTag('franceconnect')
    await getAppToStartingState()
    await ProfilePage.navigate()
    const identityBolds = await ProfilePage.getIdentityBolds()
    original = {
      identityBolds,
      preferredUsername: (identityBolds[0] ?? '').replace(/^.+?\s/, '').replace(/,$/, '').trim(),
    }
  })

  after(async () => {
    // Protège le compte si le test échoue avant le logout.
    if (!original) return
    try { await ProfilePage.navigateToProfileDirect() } catch { /* silencieux */ }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch { /* silencieux */ }
  })

  it('se déconnecte après confirmation, puis se reconnecte avec les données d\'origine', async function () {
    this.timeout(240000)
    await AllureReporter.addStep("1. Modifier le nom d'usage")
    await ProfilePage.editPreferredUsername(MODIFIED_PREFERRED_USERNAME)
    expect((await ProfilePage.getIdentityBolds()).some(b => b.includes(MODIFIED_PREFERRED_USERNAME))).toBe(true)

    await AllureReporter.addStep('2. Se déconnecter via le menu Plus et confirmer la suppression des données')
    await HomePage.isHomeReachable()
    await ProfilePage.logout()

    await AllureReporter.addStep("3. L'écran de connexion FranceConnect est de nouveau proposé")
    await FranceConnectMirePage.waitForLoginScreen()

    await AllureReporter.addStep('4. Se reconnecter avec le même compte')
    await getAppToStartingState({grantConsent: false})

    await AllureReporter.addStep("5. Le nom d'usage modifié a été supprimé")
    await ProfilePage.navigate()
    const bolds = await ProfilePage.getIdentityBolds()
    for (const expected of original.identityBolds) expect(bolds).toContain(expected)
    expect(bolds.some(b => b.includes(MODIFIED_PREFERRED_USERNAME))).toBe(false)
  })
})
