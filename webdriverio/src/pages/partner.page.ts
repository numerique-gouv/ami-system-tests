import { getPartnerLocators } from './locators/partner.locators'

class PartnerPage {
  async isVisible(): Promise<boolean> {
    try {
      const loc = getPartnerLocators()
      return await $(loc.screenRoot).isDisplayed()
    } catch {
      return false
    }
  }

  async getName(): Promise<string> {
    const loc = getPartnerLocators()
    return await $(loc.partnerName).getText()
  }

  async getDescription(): Promise<string> {
    const loc = getPartnerLocators()
    return await $(loc.partnerDescription).getText()
  }

  async isWebsiteLinkVisible(): Promise<boolean> {
    const loc = getPartnerLocators()
    return await $(loc.partnerWebsiteLink).isDisplayed()
  }

  async isContactButtonVisible(): Promise<boolean> {
    const loc = getPartnerLocators()
    return await $(loc.contactButton).isDisplayed()
  }

  async goBack(): Promise<void> {
    const loc = getPartnerLocators()
    await $(loc.backButton).click()
  }
}

export default new PartnerPage()
