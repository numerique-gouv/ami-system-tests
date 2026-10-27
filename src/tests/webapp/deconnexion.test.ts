import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '../../pages/franceconnect/franceconnect-mire.page'
import {getAppToStartingState} from '@pages/authenticate.process'
import {step} from '@helpers/reporting/report'

// Valeur clairement identifiable comme donnée de test. Le logout supprime les données saisies dans
// l'app (modale « Suppression de vos données ») : la reconnexion doit retrouver les données d'origine.
const MODIFIED_PREFERRED_USERNAME = 'NOMTEST'

describe('Déconnexion', function () {
  this.timeout(240000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  let original: {identityBolds: string[]; preferredUsername: string}

  before(async function () {
    await getAppToStartingState()
    await ProfilePage.navigate()
    const identityBolds = await ProfilePage.getIdentityBolds()
    original = {
      identityBolds,
      preferredUsername: (identityBolds[0] ?? '').replace(/^.+?\s/, '').replace(/,$/, '').trim(),
    }
  })

  after(async () => {
    // Aucun test ne termine déconnecté : si le test s'arrête entre la déconnexion et la reconnexion, on rouvre la session
    // (sans effet quand la reconnexion du test a abouti : la session ouverte est détectée, l'authentification n'est pas refaite).
    await getAppToStartingState()
    // Protège le compte si le test échoue avant le logout.
    if (!original) return
    await ProfilePage.restore(original)
  })

  it('se déconnecte après confirmation, puis se reconnecte avec les données d\'origine', async function () {
    step("1. Modifier le nom d'usage")
    await ProfilePage.editPreferredUsername(MODIFIED_PREFERRED_USERNAME)
    expect(await ProfilePage.getPreferredUsernameField()).toBe(MODIFIED_PREFERRED_USERNAME)

    step('2. Se déconnecter via le menu Plus et confirmer la suppression des données')
    await getAppToStartingState()
    await ProfilePage.logout()

    step("3. L'écran de connexion FranceConnect est de nouveau proposé")
    await FranceConnectMirePage.waitForLoginScreen()

    step('4. Se reconnecter avec le même compte')
    await getAppToStartingState()

    step("5. Le nom d'usage modifié a été supprimé")
    await ProfilePage.navigate()
    const bolds = await ProfilePage.getIdentityBolds()
    for (const expected of original.identityBolds) expect(bolds).toContain(expected)
    // Les bolds viennent de FranceConnect même modifiés (cf. getPreferredUsernameField) : le champ du formulaire prouve la suppression.
    expect(await ProfilePage.getPreferredUsernameField()).toBe(original.preferredUsername)
  })
})
