import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'
import SettingsPage from '../pages/settings.page'

describe('Paramètres', () => {
  before(async () => {
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
    await expect(title.length).toBeGreaterThan(0)
  })

  it("affiche le numéro de version de l'application", async () => {
    const version = await SettingsPage.getVersionLabel()
    // Le numéro de version doit ressembler à "0.2.2" ou "0.3"
    await expect(version).toMatch(/\d+\.\d+/)
  })

  it('affiche le toggle de notifications', async () => {
    const enabled = await SettingsPage.isNotificationsToggleEnabled()
    // On vérifie juste que la valeur est récupérable (boolean)
    await expect(typeof enabled).toBe('boolean')
  })

  it('peut activer/désactiver les notifications', async () => {
    const before = await SettingsPage.isNotificationsToggleEnabled()
    await SettingsPage.toggleNotifications()
    await browser.pause(500)
    const after = await SettingsPage.isNotificationsToggleEnabled()
    await expect(after).toBe(!before)

    // On remet dans l'état initial
    await SettingsPage.toggleNotifications()
  })
})
