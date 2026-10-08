import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '@pages/authenticate.process'
import logger from '@wdio/logger'
import {step} from '@helpers/report'

const log = logger('test')

// Valeur clairement identifiable comme donnée de test. Le logout supprime les données saisies dans
// l'app (modale « Suppression de vos données ») : la reconnexion doit retrouver les données d'origine.
const MODIFIED_PREFERRED_USERNAME = 'NOMTEST'

describe('Déconnexion', () => {
  let original: {identityBolds: string[]; preferredUsername: string}

  before(async function () {
    this.timeout(180000)
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
    try { await ProfilePage.navigateToProfileDirect() } catch (err) { log.warn('after : retour au profil impossible', err) }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch (err) { log.warn('after : restauration du nom d\'usage impossible', err) }
  })

  it('se déconnecte après confirmation, puis se reconnecte avec les données d\'origine', async function () {
    this.timeout(240000)
    step("1. Modifier le nom d'usage")
    await ProfilePage.editPreferredUsername(MODIFIED_PREFERRED_USERNAME)
    expect((await ProfilePage.getIdentityBolds()).some(b => b.includes(MODIFIED_PREFERRED_USERNAME))).toBe(true)

    step('2. Se déconnecter via le menu Plus et confirmer la suppression des données')
    await HomePage.goToHomeFromAnywhere(15000)
    await ProfilePage.logout()

    step("3. L'écran de connexion FranceConnect est de nouveau proposé")
    await FranceConnectMirePage.waitForLoginScreen()

    step('4. Se reconnecter avec le même compte')
    await getAppToStartingState({grantConsent: false})

    step("5. Le nom d'usage modifié a été supprimé")
    await ProfilePage.navigate()
    const bolds = await ProfilePage.getIdentityBolds()
    for (const expected of original.identityBolds) expect(bolds).toContain(expected)
    expect(bolds.some(b => b.includes(MODIFIED_PREFERRED_USERNAME))).toBe(false)
  })
})
