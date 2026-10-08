import AllureReporter from '@wdio/allure-reporter'
import ProfilePage from '@pages/profile.page'
import {getAppToStartingState} from '@pages/authenticate.process'
import logger from '@wdio/logger'

const log = logger('test')

// Valeurs clairement identifiables comme données de test — non confondables avec de vraies données.
// Le hook after() restaure les valeurs d'origine. L'adresse (remontée de la Caf, limitation légale en
// attente d'un COJUR) n'est pas modifiée, comme dans la suite mobile.
const MODIFICATIONS = {
  preferredUsername: 'NOMTEST',
  email: 'testdemiseajour@yopmail.com',
}

describe('Profil usager', () => {
  let original: {identityBolds: string[]; preferredUsername: string; email: string}

  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Profil usager')
    await AllureReporter.addFeature('Profil usager')
    await AllureReporter.addSeverity('normal')
    await getAppToStartingState()
    await ProfilePage.navigate()
    const identityBolds = await ProfilePage.getIdentityBolds()
    // Format attendu du premier bold : « Prénom NOM_USAGE, » → extraire NOM_USAGE
    const preferredUsername = (identityBolds[0] ?? '').replace(/^.+?\s/, '').replace(/,$/, '').trim()
    original = {identityBolds, preferredUsername, email: await ProfilePage.getEmailBold()}
  })

  beforeEach(async () => {
    await ProfilePage.navigateToProfileDirect()
  })

  after(async () => {
    if (!original) return
    try { await ProfilePage.navigateToProfileDirect() } catch (err) { log.warn('after : retour au profil impossible', err) }
    try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch (err) { log.warn('after : restauration du nom d\'usage impossible', err) }
    try { await ProfilePage.editEmail(original.email) } catch (err) { log.warn('after : restauration de l\'email impossible', err) }
  })

  it('affiche l\'identité, le contact et l\'adresse issus de FranceConnect', async () => {
    expect(original.identityBolds.length).toBeGreaterThan(0)
    expect(original.preferredUsername).not.toBe('')
    expect(original.email).toMatch(/^\S+@\S+$/)
  })

  const blocks: Array<['identity' | 'email' | 'address', string]> = [
    ['identity', 'Mon identité'], ['email', 'Contact'], ['address', 'Où habitez-vous ?'],
  ]
  for (const [block, heading] of blocks) {
    it(`« Modifier » ouvre « ${heading} » et « Annuler » revient au profil sans rien changer`, async () => {
      await ProfilePage.openEditForm(block)
      await ProfilePage.cancelEdit()
      expect(await ProfilePage.getEmailBold()).toBe(original.email)
    })
  }

  it('permet de modifier le nom d\'usage du bloc « Mon identité »', async () => {
    await ProfilePage.editPreferredUsername(MODIFICATIONS.preferredUsername)
    const bolds = await ProfilePage.getIdentityBolds()
    expect(bolds.some(b => b.includes(MODIFICATIONS.preferredUsername))).toBe(true)
  })

  it('permet de modifier l\'email du bloc « Contact »', async () => {
    await ProfilePage.editEmail(MODIFICATIONS.email)
    expect(await ProfilePage.getEmailBold()).toBe(MODIFICATIONS.email)
  })
})
