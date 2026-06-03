import AllureReporter from '@wdio/allure-reporter'
import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'

describe('Onboarding', () => {
  before(() => {
    AllureReporter.addFeature('Onboarding')
    AllureReporter.addSeverity('normal')
  })

  beforeEach(async () => {
    // Repart d'un état propre : réinstalle l'app pour rejouer l'onboarding
    await driver.terminateApp('fr.gouv.ami.staging')
    await driver.activateApp('fr.gouv.ami.staging')
  })

  it("affiche l'écran d'onboarding au premier lancement", async () => {
    expect(await OnboardingPage.isVisible()).toBe(true)
  })

  it('affiche un titre de bienvenue non vide', async () => {
    const title = await OnboardingPage.getTitle()
    expect(title).not.toBe('')
  })

  it("permet de passer l'onboarding via le bouton skip", async () => {
    await OnboardingPage.skip()
    await HomePage.waitForVisible()
    expect(await HomePage.isVisible()).toBe(true)
  })

  it("permet de parcourir toutes les étapes et d'arriver sur le home", async () => {
    await OnboardingPage.completeAll()
    await HomePage.waitForVisible()
    expect(await HomePage.isVisible()).toBe(true)
  })
})
