import AllureReporter from '@wdio/allure-reporter'
import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'
import SettingsPage from '../pages/settings.page'

describe('Paramètres', () => {
  before(async () => {
    AllureReporter.addFeature('Paramètres')
    AllureReporter.addSeverity('normal')
    const onboardingVisible = await OnboardingPage.isVisible()
    if (onboardingVisible) {
      await OnboardingPage.skip()
    }
    await HomePage.waitForVisible()
    await HomePage.goToSettings()
    await SettingsPage.waitForVisible()
  })

  it("affiche le titre de l'écran paramètres", async () => {
    const title = await SettingsPage.getTitle()
    expect(title).not.toBe('')
  })

  it("affiche le numéro de version de l'application", async () => {
    const version = await SettingsPage.getVersionLabel()
    // Le numéro de version doit ressembler à "0.2.2" ou "0.3"
    expect(version).toMatch(/\d+\.\d+/)
  })

  it('affiche le toggle de notifications', async () => {
    // Une exception ici indique un bug driver — la valeur (true/false) importe peu
    await SettingsPage.isNotificationsToggleEnabled()
  })

  it('peut activer/désactiver les notifications', async () => {
    const before = await SettingsPage.isNotificationsToggleEnabled()
    await SettingsPage.toggleNotifications()
    await browser.waitUntil(
      async () => (await SettingsPage.isNotificationsToggleEnabled()) !== before,
      { timeout: 3000, interval: 200, timeoutMsg: 'État du toggle non mis à jour en 3s' }
    )
    const after = await SettingsPage.isNotificationsToggleEnabled()
    expect(after).toBe(!before)

    // On remet dans l'état initial
    await SettingsPage.toggleNotifications()
  })
})
