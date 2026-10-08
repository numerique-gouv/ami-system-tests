import ServicesPage from '../../pages/services.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Services : onglets « Trouver de l'aide » et « Démarches et outils », checklists éditoriales,
 * fiche d'un service partenaire. Les liens sortants (service-public.gouv.fr,
 * demarche.numerique.gouv.fr…) quittent la SPA : on teste leur présence, pas la disponibilité de ces sites.
 * Lecture seule : aucune case de checklist n'est cochée.
 */
describe('Services', () => {
  before(async function () {
    this.timeout(180000)
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
    await ServicesPage.open()
  })

  it('« Trouver de l\'aide » propose SOS, les checklists et l\'annuaire', async () => {
    await ServicesPage.assertHelpTabSections()
    await ServicesPage.waitForEntries([
      'Je suis victime de cybermalveillance',
      'Signaler une violence conjugale, sexuelle ou sexiste',
      'Test WebView AMI',
      'Je crée une association',
      'Je deviens parent',
      'Je pars vivre à l’étranger',
      'Je souhaite accompagner mon enfant de 15 à 18 ans dans ses droits et ses démarches',
      'Je suis affecté à l’étranger',
      'Accéder à l’annuaire',
    ])
  })

  it('« Démarches et outils » liste les cartes des partenaires', async () => {
    await ServicesPage.selectTab('Démarches et outils')
    await ServicesPage.waitForEntries([
      /^APIAS/, /^Changement de situation familiale/, /^Contacter l.équipe AMI/,
      /^Opération Tranquillité Vacances/, /^Rendez-vous/, 'Voir toutes les démarches',
    ])
  })

  it('ouvre une checklist, ses sections, puis une section avec ses cases décochées', async () => {
    await ServicesPage.openChecklist('Je crée une association')
    const sections = await ServicesPage.checklistSections()
    expect(sections).toEqual(['Cas général 0/7', 'Alsace-Moselle 0/7'])

    await ServicesPage.openChecklistSection(sections[0])
    expect(await ServicesPage.checklistProgress()).toEqual({total: 7, checked: 0})
  })

  it('la fiche « Opération Tranquillité Vacances » propose « Bénéficier de ce service »', async () => {
    await ServicesPage.openOperationTranquilliteVacances()
    await ServicesPage.assertBenefitButtonOffered()
  })
})
