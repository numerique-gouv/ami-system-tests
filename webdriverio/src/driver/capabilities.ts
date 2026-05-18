import path from 'path'

// Chemins vers les apps buildées (générées via `just build-android` / `just build-ios`)
const ANDROID_APP_PATH = path.resolve(
  __dirname,
  '../../../../ami-app-android/app/build/outputs/apk/staging/debug/app-staging-debug.apk'
)

const IOS_APP_PATH = path.resolve(
  __dirname,
  '../../../../ami-app-ios/build/Build/Products/Debug-iphonesimulator/AMI.app'
)

// ─── Android ────────────────────────────────────────────────────────────────

export const androidCapabilities: WebdriverIO.Capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Pixel_oldest',
  'appium:platformVersion': '8.0',
  'appium:app': ANDROID_APP_PATH,
  'appium:appPackage': 'fr.gouv.ami.staging',
  'appium:appActivity': 'fr.gouv.ami.MainActivity',
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,
  'appium:androidInstallTimeout': 90000,
  'appium:autoGrantPermissions': true,
  'appium:disableWindowAnimation': true,
}

// ─── iOS ────────────────────────────────────────────────────────────────────

export const iosCapabilities: WebdriverIO.Capabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:deviceName': 'iPhone 15',
  'appium:platformVersion': '17.0',
  'appium:app': IOS_APP_PATH,
  'appium:bundleId': 'fr.gouv.ami.staging',
  'appium:noReset': false,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,
  'appium:wdaLaunchTimeout': 120000,
  'appium:wdaConnectionTimeout': 120000,
  'appium:shouldTerminateApp': true,
  'appium:autoAcceptAlerts': false,  // géré manuellement dans les tests
}
