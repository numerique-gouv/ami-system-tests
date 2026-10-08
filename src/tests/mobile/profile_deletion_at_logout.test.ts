import AllureReporter from '@wdio/allure-reporter'
import HomePage from '../../pages/home.page'
import ProfilePage from '@pages/profile.page'
import FranceConnectMirePage from '@pages/franceconnect/franceconnect-mire.page'
import { getAppToStartingState } from '@pages/authenticate.process'
import logger from '@wdio/logger'

const log = logger('test')

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le logout déclenche la suppression côté app — le after() restaure en cas d'échec avant logout.
// L'adresse, remontée de la Caf, implique une limitation légale : elle est écartée des tests en attendant un COJUR.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
}

describe('Profil usager — suppression des modifications à la déconnexion', () => {
  // Données initiales capturées dynamiquement — non codées en dur.
  // Initialisées dans le before() pour refléter l'état réel du compte au moment du test.
  let original: {
    identityBolds: string[]
    preferredUsername: string  // extrait du displayName pour restauration after()
    email: string
  }

  before(async () => {
    await AllureReporter.addEpic('Profil usager')
    await AllureReporter.addFeature('Profil usager — suppression au logout')
    await AllureReporter.addStory('Restauration des données à la déconnexion/reconnexion')
    await AllureReporter.addSeverity('critical')
    await AllureReporter.addTag('franceconnect')

    await getAppToStartingState()

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
    }
  })

  after(async () => {
    // Restauration best-effort : protège le compte si le test échoue avant le logout.
    // Sans cela, les données modifiées resteraient et pollueraient les runs suivants.
    if (!original) return
    try { await ProfilePage.navigateToProfileDirect() } catch (err) { log.warn('after : retour au profil impossible', err) }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch (err) { log.warn('after : restauration du nom d\'usage impossible', err) }
    try { await ProfilePage.editEmail(original.email) } catch (err) { log.warn('after : restauration de l\'email impossible', err) }
    // Adresse originale vide (compte sans adresse Caf) : rien à restaurer, la reconnexion FranceConnect
    // a déjà ramené l'adresse à cet état vide — appeler editAddress('') échouerait dans l'autocomplétion BAN.
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

  // Désactivé en attendant le COJUR sur l'adresse remontée de la Caf (cf. en-tête du fichier).
  // Corps conservé pour la réactivation (ProfilePage.editAddress / getAddressBolds à rétablir).
  it.skip('modifie l\'adresse', async () => {
    await AllureReporter.addStep('Modifier l\'adresse via autocomplétion BAN')
    // await ProfilePage.editAddress('20 avenue de Ségur Paris')

    // const bolds = await ProfilePage.getAddressBolds()
    // expect(bolds.some(b => b.toLowerCase().includes('ségur'))).toBe(true)
  })

  it('se déconnecte via le menu plus', async () => {
    await AllureReporter.addStep('Taper Me déconnecter depuis le menu plus')
    await HomePage.goToHomeFromAnywhere(15000)
    await ProfilePage.logout()

    // La déconnexion n'est finie qu'au retour sur l'écran de connexion : la fin de session FranceConnect
    // est un aller-retour que la suite ne doit pas interrompre.
    await AllureReporter.addStep('Attendre l\'écran de connexion')
    await FranceConnectMirePage.waitForLoginScreen()
  })

  it('se reconnecte avec le même compte', async () => {
    await AllureReporter.addStep('Lancer le flow FranceConnect')
    await getAppToStartingState({grantConsent:false})

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

  // Désactivé en attendant le COJUR. Attendu : pour un compte sans adresse Caf, l'état original est
  // l'absence d'adresse (à vérifier explicitement, pas seulement l'absence de « Ségur »).
  it.skip('affiche l\'adresse originale (pas la valeur modifiée)', async () => {
    await AllureReporter.addStep('Vérifier que l\'adresse est restaurée')
    // const bolds = await ProfilePage.getAddressBolds()
    // Compte sans adresse Caf : l'état original est l'absence d'adresse — vérifier ce fait explicitement,
    // pas seulement l'absence de « Ségur » (qui passerait aussi si une autre adresse s'affichait par erreur).
    // expect(bolds).toEqual([])
  })
})
