import type { Locator } from './onboarding.locators'

export interface HomeLocators {
  screenRoot: Locator
  pageTitle: Locator
  notificationBell: Locator
  partnerList: Locator
  firstPartnerCard: Locator
  settingsTabButton: Locator
  homeTabButton: Locator
}

export const androidHomeLocators: HomeLocators = {
  screenRoot:        'id:fr.gouv.ami.staging:id/home_screen',
  pageTitle:         'id:fr.gouv.ami.staging:id/home_title',
  notificationBell:  'id:fr.gouv.ami.staging:id/notification_bell',
  partnerList:       'id:fr.gouv.ami.staging:id/partner_list',
  firstPartnerCard:  'id:fr.gouv.ami.staging:id/partner_card_0',
  settingsTabButton: 'id:fr.gouv.ami.staging:id/tab_settings',
  homeTabButton:     'id:fr.gouv.ami.staging:id/tab_home',
}

export const iosHomeLocators: HomeLocators = {
  screenRoot:        '~home_screen',
  pageTitle:         '~home_title',
  notificationBell:  '~notification_bell',
  partnerList:       '~partner_list',
  firstPartnerCard:  '~partner_card_0',
  settingsTabButton: '~tab_settings',
  homeTabButton:     '~tab_home',
}

export function getHomeLocators(): HomeLocators {
  return driver.isIOS ? iosHomeLocators : androidHomeLocators
}
