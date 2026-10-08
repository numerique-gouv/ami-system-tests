import AideContactPage from '../../pages/aide-contact.page'
import HomePage from '../../pages/home.page'
import NavigationPage from '../../pages/navigation.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Aide et contact, Contact, pages légales (données personnelles, accessibilité).
 * Les liens sortants (service-public.gouv.fr, demarche.numerique.gouv.fr) quittent la SPA : on teste
 * la présence des entrées, pas la disponibilité de ces sites tiers.
 */
describe('Aide, contact et pages légales', () => {
  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
  })

  it('« Aide et contact » propose l\'aide de l\'administration et le problème applicatif', async () => {
    await AideContactPage.openHelpCenter()
    expect(await AideContactPage.helpEntries()).toEqual([
      'J’ai besoin de l’aide de l’administration',
      'Je rencontre un problème sur l’application',
    ])
  })

  it('« Je rencontre un problème sur l\'application » ouvre Contact et son dialogue d\'actions', async () => {
    await AideContactPage.openHelpCenter()
    await AideContactPage.openContactFromHelpCenter()
    expect(await AideContactPage.openContactDialog()).toEqual(['Faire une demande en ligne', 'Envoyer un mail'])
  })

  it('« Données personnelles et sécurité » liste ses 6 sections', async () => {
    await NavigationPage.openPlusEntry('Données personnelles et sécurité')
    expect(await AideContactPage.legalSections('Données personnelles et sécurité')).toEqual([
      'Qui traite vos données ?',
      'Finalité et base légale',
      'Catégories de données et durée de conservation',
      'Qui sont les destinataires de vos données',
      'Quels sont vos droits sur vos données et comment les exercer',
      'Transfert de données hors de l’union européenne',
    ])
  })

  it('« Accessibilité » liste ses sections', async () => {
    await NavigationPage.openPlusEntry('Accessibilité')
    expect(await AideContactPage.legalSections('Accessibilité')).toEqual([
      'Déclaration d’accessibilité',
      'Déclaration d’accessibilité',
      'Retour d’information et contact',
      'Voies de recours',
    ])
  })
})
