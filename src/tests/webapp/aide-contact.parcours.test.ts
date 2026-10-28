import {AssertionError} from 'node:assert'
import AideContactPage from '../../pages/aide-contact.page'
import NavigationPage from '../../pages/navigation.page'
import {getAppToStartingState} from '../../pages/authenticate.process'
import {describeTarget, isBrokenTarget} from '../../helpers/webapp/link-check'

/**
 * Aide et contact, Contact, pages légales (données personnelles, accessibilité).
 * Les liens sortants quittent la SPA : on teste la présence des entrées ; seule l'aide de l'administration (service-public.gouv.fr)
 * est contrôlée en HTTP (avec `link-check`). Le catalogue, les moments de vie et les listes d'étapes ont leurs propres parcours.
 */
describe('Aide, contact et pages légales', function () {
  this.timeout(180000) // WDIO lit le délai avant d'exécuter un it/hook : il se pose au niveau du describe
  beforeEach(async function () {
    await getAppToStartingState()
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

  it('« J\'ai besoin de l\'aide de l\'administration » mène à une page service-public.gouv.fr qui répond', async () => {
    await AideContactPage.openHelpCenter()
    const target = await AideContactPage.openAdministrationHelp()
    if (isBrokenTarget(target)) throw new AssertionError({message: `Aide de l'administration : ${describeTarget(target)} répond ${target.status} (« ${target.title} »)`})
    expect(target.host).toContain('service-public.gouv.fr')
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
