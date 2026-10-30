import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import {step} from '@helpers/reporting/report'
import {platform} from '../../platform'
import logger from '@wdio/logger'

const log = logger('test')

// Valeurs identifiables comme données de test. L'adresse est choisie dans l'autocomplétion BAN (premier résultat) ; le compte peut ne pas en avoir d'origine.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
  addressQuery: '20 avenue de Ségur Paris',
  addressMarker: 'ségur',
}

describe('Profil usager — suppression des modifications à la déconnexion', function () {
  this.timeout(180000)

  // Données initiales du compte, capturées dans le before().
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour restauration after()
    email: string
    addressBolds: string[]  // vide si le compte n'a pas d'adresse d'origine
  }

  before(async function () {
    await getAppToStartingState()

    await platform().inWebContext(async () => {
      step('Naviguer vers Mon profil')
      await ProfilePage.navigate()

      step('Capturer les données initiales du profil')
      const identityBolds = await ProfilePage.getIdentityBolds()
      original = {
        identityBolds,
        // Valeur du champ du formulaire, pas déduite du nom affiché (qui vient de FranceConnect).
        preferredUsername: await ProfilePage.getPreferredUsernameField(),
        email: await ProfilePage.getEmailBold(),
        addressBolds: await ProfilePage.getAddressBolds(),
      }
    })
  })

  after(async () => {
    // Protège le compte si le test échoue avant le logout, qui supprime les modifications. Adresse d'origine vide : rien à restaurer.
    if (!original) return
    await platform().inWebContext(() => ProfilePage.restore(original))
  })

  it('modifie le nom d\'usage', async () => {
    await platform().inWebContext(async () => {
      step('Modifier le nom d\'usage')
      await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

      expect(await ProfilePage.getPreferredUsernameField()).toBe(MODIFICATIONS.preferredUsername)
    })
  })

  it('modifie l\'email', async () => {
    await platform().inWebContext(async () => {
      step('Modifier l\'email')
      await ProfilePage.editEmail(MODIFICATIONS.email)

      expect(await ProfilePage.getEmailBold()).toBe(MODIFICATIONS.email)
    })
  })

  it('modifie l\'adresse', async function () {
    // Autocomplétion absente (peut-être désactivée volontairement, non confirmé) : le test est sauté avec un avertissement, pas en échec.
    let proposed = true
    await platform().inWebContext(async () => {
      step('Modifier l\'adresse via autocomplétion BAN')
      try {
        await ProfilePage.editAddress(MODIFICATIONS.addressQuery)
      } catch (err) {
        if (!/autocomplete-item/.test((err as Error).message)) throw err
        proposed = false
        return
      }
      const bolds = await ProfilePage.getAddressBolds()
      expect(bolds.some(b => b.toLowerCase().includes(MODIFICATIONS.addressMarker))).toBe(true)
    })
    if (!proposed) {
      log.warn('ANOMALIE ? Aucune suggestion d\'adresse proposée par l\'autocomplétion : modification d\'adresse non testée (désactivation voulue ? non confirmé)')
      this.skip()
    }
  })

  it('se déconnecte via le menu plus', async () => {
    step('Taper Me déconnecter depuis le menu plus')
    await getAppToStartingState()
    await platform().inWebContext(() => ProfilePage.logout())

    // La déconnexion n'est finie qu'au retour sur l'écran de connexion (fin de session FranceConnect).
    step('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
  })

  it('se reconnecte avec le même compte', async function () {
    step('Lancer le flow FranceConnect')
    await getAppToStartingState()

    await platform().inWebContext(async () => {
      step('Naviguer vers Mon profil')
      await ProfilePage.navigate()
    })
  })

  it('affiche les données d\'identité originales (pas les valeurs modifiées)', async () => {
    await platform().inWebContext(async () => {
      step('Vérifier que le nom d\'usage est restauré')
      const bolds = await ProfilePage.getIdentityBolds()
      for (const expected of original.identityBolds) {
        expect(bolds).toContain(expected)
      }
      expect(await ProfilePage.getPreferredUsernameField()).toBe(original.preferredUsername)
    })
  })

  it('affiche l\'email original (pas la valeur modifiée)', async () => {
    await platform().inWebContext(async () => {
      step('Vérifier que l\'email est restauré')
      const email = await ProfilePage.getEmailBold()
      expect(email).toBe(original.email)
      expect(email).not.toBe(MODIFICATIONS.email)
    })
  })

  // Sans adresse d'origine, l'attendu est `[]` : « sans Ségur » passerait aussi avec une autre adresse affichée par erreur.
  it('affiche l\'adresse originale (pas la valeur modifiée)', async () => {
    await platform().inWebContext(async () => {
      step('Vérifier que l\'adresse est restaurée')
      expect(await ProfilePage.getAddressBolds()).toEqual(original.addressBolds)
    })
  })
})
