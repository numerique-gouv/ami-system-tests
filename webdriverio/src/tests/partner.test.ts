import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'
import PartnerPage from '../pages/partner.page'

describe('Partenaire — écran de détail', () => {
  before(async () => {
    const onboardingVisible = await OnboardingPage.isVisible()
    if (onboardingVisible) {
      await OnboardingPage.skip()
    }
    await HomePage.waitForVisible()
    await HomePage.openFirstPartner()
  })

  after(async () => {
    await PartnerPage.goBack()
  })

  it("affiche le nom du partenaire", async () => {
    const name = await PartnerPage.getName()
    await expect(name.length).toBeGreaterThan(0)
  })

  it("affiche la description du partenaire", async () => {
    const description = await PartnerPage.getDescription()
    await expect(description.length).toBeGreaterThan(0)
  })

  it("affiche un lien vers le site web du partenaire", async () => {
    await expect(await PartnerPage.isWebsiteLinkVisible()).toBe(true)
  })

  it("affiche un bouton de contact", async () => {
    await expect(await PartnerPage.isContactButtonVisible()).toBe(true)
  })
})
