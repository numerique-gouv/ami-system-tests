import AllureReporter from '@wdio/allure-reporter'
import PreferencesPage from '../../pages/preferences.page'
import HomePage from '../../pages/home.page'
import {getAppToStartingState} from '../../pages/authenticate.process'

/**
 * Préférences : suivi des démarches par partenaire (consentements), notifications, zones scolaires.
 * Lecture seule : aucune case n'est cliquée (« Activer » les notifications déclencherait une demande
 * de permission, « Tout suivre » modifierait les consentements du compte partagé).
 */
describe('Préférences', () => {
  before(async function () {
    this.timeout(180000)
    await AllureReporter.addEpic('Préférences')
    await AllureReporter.addFeature('Préférences')
    await AllureReporter.addSeverity('normal')
    // grantConsent par défaut : le consentement AMI est la précondition du test « consentements ».
    await getAppToStartingState()
  })

  beforeEach(async () => {
    await HomePage.goToHomeFromAnywhere(15000)
    await PreferencesPage.open()
    await PreferencesPage.assertDisplayed()
  })

  it('propose les 3 entrées : suivi des démarches, notifications, zones scolaires', async () => {
    expect(await PreferencesPage.entries()).toEqual(['Suivi des démarches', 'Notifications', 'Zones scolaires'])
  })

  it('« Suivi des démarches » liste un partenaire par case, AMI suivi après consentement', async () => {
    await PreferencesPage.openConsents()
    const states = await PreferencesPage.consentStates()
    expect(Object.keys(states)).toEqual(['dinum-ami', 'dinum-dn', 'dinum-rdvsp', 'psl', 'Test', 'test-test'])
    expect(states['dinum-ami']).toBe(true)
    expect(await PreferencesPage.consentLabels()).toEqual(expect.arrayContaining(['AMI', 'Démarche Numérique', 'Service Public']))
  })

  it('« Notifications » affiche la case de réception sur l\'appareil', async () => {
    await PreferencesPage.openNotifications()
    expect(typeof await PreferencesPage.notificationToggleState()).toBe('boolean')
  })
})
