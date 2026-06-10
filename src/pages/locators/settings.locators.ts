import type { Locator } from './onboarding.locators'

export interface SettingsLocators {
  screenRoot: Locator
  screenTitle: Locator
  notificationsToggle: Locator
  darkModeToggle: Locator
  aboutButton: Locator
  versionLabel: Locator
  logoutButton: Locator
}

export const androidSettingsLocators: SettingsLocators = {
  screenRoot:           'id:fr.gouv.ami.staging:id/settings_screen',
  screenTitle:          'id:fr.gouv.ami.staging:id/settings_title',
  notificationsToggle:  'id:fr.gouv.ami.staging:id/settings_notifications_toggle',
  darkModeToggle:       'id:fr.gouv.ami.staging:id/settings_dark_mode_toggle',
  aboutButton:          'id:fr.gouv.ami.staging:id/settings_about_button',
  versionLabel:         'id:fr.gouv.ami.staging:id/settings_version_label',
  logoutButton:         'id:fr.gouv.ami.staging:id/settings_logout_button',
}

export const iosSettingsLocators: SettingsLocators = {
  screenRoot:           '~settings_screen',
  screenTitle:          '~settings_title',
  notificationsToggle:  '~settings_notifications_toggle',
  darkModeToggle:       '~settings_dark_mode_toggle',
  aboutButton:          '~settings_about_button',
  versionLabel:         '~settings_version_label',
  logoutButton:         '~settings_logout_button',
}

export function getSettingsLocators(): SettingsLocators {
  return driver.isIOS ? iosSettingsLocators : androidSettingsLocators
}
