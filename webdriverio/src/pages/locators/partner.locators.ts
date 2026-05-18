import type { Locator } from './onboarding.locators'

export interface PartnerLocators {
  screenRoot: Locator
  partnerName: Locator
  partnerDescription: Locator
  partnerWebsiteLink: Locator
  backButton: Locator
  contactButton: Locator
}

export const androidPartnerLocators: PartnerLocators = {
  screenRoot:          'id:fr.gouv.ami.staging:id/partner_detail_screen',
  partnerName:         'id:fr.gouv.ami.staging:id/partner_name',
  partnerDescription:  'id:fr.gouv.ami.staging:id/partner_description',
  partnerWebsiteLink:  'id:fr.gouv.ami.staging:id/partner_website_link',
  backButton:          'id:fr.gouv.ami.staging:id/back_button',
  contactButton:       'id:fr.gouv.ami.staging:id/partner_contact_button',
}

export const iosPartnerLocators: PartnerLocators = {
  screenRoot:          '~partner_detail_screen',
  partnerName:         '~partner_name',
  partnerDescription:  '~partner_description',
  partnerWebsiteLink:  '~partner_website_link',
  backButton:          '~back_button',
  contactButton:       '~partner_contact_button',
}

export function getPartnerLocators(): PartnerLocators {
  return driver.isIOS ? iosPartnerLocators : androidPartnerLocators
}
