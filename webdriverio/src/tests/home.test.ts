import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'
import PartnerPage from '../pages/partner.page'
import SettingsPage from '../pages/settings.page'

describe('Home', () => {
  before(async () => {
    // Passe l'onboarding une fois pour la suite de tests
    const onboardingVisible = await OnboardingPage.isVisible()
    if (onboardingVisible) {
      await OnboardingPage.skip()
    }
    await HomePage.waitForVisible()
  })

  it("affiche le titre de la page d'accueil", async () => {
    const title = await HomePage.getTitle()
    expect(title.length).toBeGreaterThan(0)
  })

  it('affiche la liste des partenaires', async () => {
    expect(await HomePage.isPartnerListVisible()).toBe(true)
  })

  it('ouvre le détail du premier partenaire au clic', async () => {
    await HomePage.openFirstPartner()
    expect(await PartnerPage.isVisible()).toBe(true)
    await PartnerPage.goBack()
  })

  it('navigue vers les paramètres via la tab bar', async () => {
    await HomePage.goToSettings()
    await SettingsPage.waitForVisible()
    expect(await SettingsPage.isVisible()).toBe(true)
  })
})
