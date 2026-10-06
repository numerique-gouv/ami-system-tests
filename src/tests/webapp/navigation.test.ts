import AllureReporter from '@wdio/allure-reporter'
import NavigationPage from '../../pages/navigation.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '../../pages/authenticate.process'
import type {PlusEntry, TabName} from '../../pages/locators/navigation.locators'

/**
 * Navigation principale : barre basse (Accueil, Agenda, Services, Suivi) et menu « Plus ».
 * Lecture seule : aucune donnée du compte n'est modifiée.
 */
describe('Navigation principale', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Navigation')
    await AllureReporter.addFeature('Navigation principale')
    await AllureReporter.addSeverity('critical')
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
  })

  const tabs: TabName[] = ['Agenda', 'Services', 'Suivi']
  for (const tab of tabs) {
    it(`la barre basse ouvre « ${tab} » puis revient à l'accueil`, async () => {
      await AllureReporter.addStep(`1. Cliquer l'onglet ${tab}`)
      await NavigationPage.goToTab(tab)
      await NavigationPage.assertBottomBarVisible()

      await AllureReporter.addStep("2. Revenir à l'accueil")
      await NavigationPage.goToTab('Accueil')
    })
  }

  it('le menu Plus propose les 6 entrées attendues', async () => {
    const entries = await NavigationPage.listPlusEntries()
    expect(entries).toEqual([
      'Mon profil',
      'Préférences',
      'Aide et contact',
      'Données personnelles et sécurité',
      'Accessibilité',
      'Me déconnecter',
    ])
  })

  const plusEntries: PlusEntry[] = [
    'Mon profil',
    'Préférences',
    'Aide et contact',
    'Données personnelles et sécurité',
    'Accessibilité',
  ]
  for (const entry of plusEntries) {
    it(`le menu Plus ouvre « ${entry} »`, async () => {
      await NavigationPage.openPlusEntry(entry)
    })
  }
})
