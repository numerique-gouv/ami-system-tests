import AllureReporter from '@wdio/allure-reporter'
import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'
import PartnerPage from '../pages/partner.page'

describe('Partenaire — écran de détail', () => {
  before(async () => {
    await AllureReporter.addFeature('Partenaire')
    await AllureReporter.addSeverity('normal')
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
    expect(name).not.toBe('')
  })

  it("affiche la description du partenaire", async () => {
    const description = await PartnerPage.getDescription()
    expect(description).not.toBe('')
  })

  it("affiche un lien vers le site web du partenaire", async () => {
    expect(await PartnerPage.isWebsiteLinkVisible()).toBe(true)
  })

  it("affiche un bouton de contact", async () => {
    expect(await PartnerPage.isContactButtonVisible()).toBe(true)
  })
})
