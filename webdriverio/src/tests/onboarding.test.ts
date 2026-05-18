import OnboardingPage from '../pages/onboarding.page'
import HomePage from '../pages/home.page'

describe('Onboarding', () => {
  beforeEach(async () => {
    // Repart d'un état propre : réinstalle l'app pour rejouer l'onboarding
    await driver.terminateApp(
      driver.isIOS ? 'fr.gouv.ami.staging' : 'fr.gouv.ami.staging'
    )
    await driver.activateApp(
      driver.isIOS ? 'fr.gouv.ami.staging' : 'fr.gouv.ami.staging'
    )
  })

  it("affiche l'écran d'onboarding au premier lancement", async () => {
    await expect(await OnboardingPage.isVisible()).toBe(true)
  })

  it('affiche un titre de bienvenue non vide', async () => {
    const title = await OnboardingPage.getTitle()
    await expect(title.length).toBeGreaterThan(0)
  })

  it("permet de passer l'onboarding via le bouton skip", async () => {
    await OnboardingPage.skip()
    await HomePage.waitForVisible()
    await expect(await HomePage.isVisible()).toBe(true)
  })

  it("permet de parcourir toutes les étapes et d'arriver sur le home", async () => {
    await OnboardingPage.completeAll()
    await HomePage.waitForVisible()
    await expect(await HomePage.isVisible()).toBe(true)
  })
})
