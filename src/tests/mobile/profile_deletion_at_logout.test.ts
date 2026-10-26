import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import {step} from '@helpers/report'
import {platform} from '../../platform'

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le logout déclenche la suppression côté app — le after() restaure en cas d'échec avant logout.
// L'adresse, remontée de la Caf, implique une limitation légale : elle est écartée des tests en attendant un COJUR.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
}

describe('Profil usager — suppression des modifications à la déconnexion', function () {
  this.timeout(180000)

  // Données initiales capturées dynamiquement — non codées en dur.
  // Initialisées dans le before() pour refléter l'état réel du compte au moment du test.
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour restauration after()
    email: string
  }

  // Connexion initiale (jusqu'à ~105 s sur une machine lente) : comme les autres specs de login, 180 s et non les 120 s
  // du délai Mocha global (campagne du 2026-10-15 : « before all » en timeout 2 fois sur 4 sur Android).
  // Le délai se pose au niveau du describe : this.timeout() dans un hook est sans effet avec WDIO (constaté le 2026-10-26 : « before all »
  // expiré à 120 s, passé au retry).
  before(async function () {
    await getAppToStartingState()

    await platform().inWebContext(async () => {
      step('Naviguer vers Mon profil')
      await ProfilePage.navigate()

      step('Capturer les données initiales du profil')
      const identityBolds = await ProfilePage.getIdentityBolds()
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
    // Restauration best-effort : protège le compte si le test échoue avant le logout.
    // Sans cela, les données modifiées resteraient et pollueraient les runs suivants.
    if (!original) return
    await platform().inWebContext(() => ProfilePage.restore(original))
    // Adresse originale vide (compte sans adresse Caf) : rien à restaurer, la reconnexion FranceConnect
    // a déjà ramené l'adresse à cet état vide — appeler editAddress('') échouerait dans l'autocomplétion BAN.
  })

  it('modifie le nom d\'usage', async () => {
    await platform().inWebContext(async () => {
      step('Modifier le nom d\'usage')
      await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)

      // Le nom affiché dans « Mon identité » vient de FranceConnect (cf. getPreferredUsernameField) : on relit le champ du formulaire.
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

  // Désactivé en attendant le COJUR sur l'adresse remontée de la Caf (cf. en-tête du fichier).
  // Corps conservé pour la réactivation (ProfilePage.editAddress / getAddressBolds à rétablir).
  it.skip('modifie l\'adresse', async () => {
    step('Modifier l\'adresse via autocomplétion BAN')
    // await ProfilePage.editAddress('20 avenue de Ségur Paris')

    // const bolds = await ProfilePage.getAddressBolds()
    // expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(true)
  })

  it('se déconnecte via le menu plus', async () => {
    step('Taper Me déconnecter depuis le menu plus')
    await getAppToStartingState()
    await platform().inWebContext(() => ProfilePage.logout())

    // La déconnexion n'est finie qu'au retour sur l'écran de connexion : la fin de session FranceConnect
    // est un aller-retour que la suite ne doit pas interrompre.
    step('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
  })

  it('se reconnecte avec le même compte', async function () {
    this.timeout(180000) // une connexion complète : même raison que le before()
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

  // Désactivé en attendant le COJUR. Attendu : pour un compte sans adresse Caf, l'état original est
  // l'absence d'adresse (à vérifier explicitement, pas seulement l'absence de « Ségur »).
  it.skip('affiche l\'adresse originale (pas la valeur modifiée)', async () => {
    step('Vérifier que l\'adresse est restaurée')
    // const bolds = await ProfilePage.getAddressBolds()
    // Compte sans adresse Caf : l'état original est l'absence d'adresse — vérifier ce fait explicitement,
    // pas seulement l'absence de « Ségur » (qui passerait aussi si une autre adresse s'affichait par erreur).
    // expect(bolds).toEqual([])
  })
})
