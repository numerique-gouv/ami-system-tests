import ProfilePage from '@pages/profile.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import {step} from '@helpers/report'
import {platform} from '../../platform'

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le hook after() restaure les valeurs d'origine après chaque passage.
// L'adresse, remontée de la Caf, implique une limitation légale : elle est écartée des tests en attendant un COJUR.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
}

describe('Profil usager — vérification des données (Mon profil)', () => {
  // Données initiales capturées dynamiquement en before() — résistantes aux changements de compte.
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour la restauration after()
    email: string
  }

  before(async () => {

    await getAppToStartingState()

    await platform().inWebContext(async () => {
      step('Naviguer vers Mon profil depuis le menu avatar')
      await ProfilePage.navigate()

      step('Capturer les données initiales du profil')
      const identityBolds = await ProfilePage.getIdentityBolds()
      // Format attendu du premier bold : "Prénom NOM_USAGE," → extraire NOM_USAGE
      const displayName = identityBolds[0] ?? ''
      const preferredUsername = displayName.replace(/^.+?\s/, '').replace(/,$/, '').trim()
      original = {
        identityBolds,
        preferredUsername,
        email: await ProfilePage.getEmailBold(),
      }
    })
  })

  after(async () => {
    // Restauration best-effort : chaque étape est indépendante pour éviter
    // qu'un échec partiel laisse le compte dans un état incohérent.
    if (!original) return
    await platform().inWebContext(() => ProfilePage.restore(original))
    // Adresse originale vide (compte sans adresse Caf) : rien à restaurer — appeler editAddress('')
    // échouerait dans l'autocomplétion BAN (aucun résultat pour une saisie vide).
  })

  it('permet de modifier le nom d\'usage dans le bloc "Mon identité"', async () => {
    step('Cliquer Modifier et saisir le nouveau nom d\'usage')
    await platform().inWebContext(async () => {
      await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

      step('Vérifier que le nouveau nom d\'usage est affiché dans le profil')
      // Le nom affiché dans « Mon identité » vient de FranceConnect (cf. getPreferredUsernameField) : on relit le champ du formulaire.
      expect(await ProfilePage.getPreferredUsernameField()).toBe(MODIFICATIONS.preferredUsername)
    })
  })

  // Désactivé en attendant le COJUR sur l'adresse remontée de la Caf (cf. en-tête du fichier).
  // Corps conservé tel quel pour la réactivation (ProfilePage.editAddress / getAddressBolds à rétablir).
  it.skip('permet de modifier l\'adresse dans le bloc "Mon adresse"', async () => {
    step('Cliquer Modifier et saisir la nouvelle adresse via l\'autocomplétion BAN')
    // await ProfilePage.editAddress('20 avenue de Ségur Paris')

    step('Vérifier que la nouvelle adresse apparaît dans le profil')
    // const bolds = await ProfilePage.getAddressBolds()
    // expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(true)
  })

  it('permet de modifier l\'email dans le bloc "Contact"', async () => {
    await platform().inWebContext(async () => {
      step('Cliquer Modifier et saisir le nouvel email')
      await ProfilePage.editEmail(MODIFICATIONS.email)

      step('Vérifier que le nouvel email est affiché dans le profil')
      const email = await ProfilePage.getEmailBold()
      expect(email).toBe(MODIFICATIONS.email)
    })
  })
})
