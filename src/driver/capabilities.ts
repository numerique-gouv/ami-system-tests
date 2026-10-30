import fs from 'fs'
import os from 'os'
import path from 'path'
import {isPreprod} from '../helpers/common/environment'

// AMI_ENV=preprod vise l'app préprod, sinon staging (review apps comprises). AMI_ENV doit correspondre à l'app de ANDROID_APP_PATH / IOS_APP_PATH.
const preprod = isPreprod()

/** Chemin de l'app buildée dans `name` : relatif à la racine du projet, `~/` pour le dossier personnel. */
function appPathFromEnv(name: 'ANDROID_APP_PATH' | 'IOS_APP_PATH'): string {
  const raw = process.env[name]?.trim()
  if (!raw) {
    throw new Error(`${name} est absente`)
  }
  const value = path.resolve(path.resolve(__dirname, '../..'), raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw)
  if (!fs.existsSync(value)) {
    throw new Error(`${name} désigne un chemin inexistant : ${value}`)
  }
  return value
}

/** `appium:app` est lu paresseusement : la variable n'est exigée que pour un run de cette plateforme. */
function withLazyAppPath(caps: WebdriverIO.Capabilities, name: 'ANDROID_APP_PATH' | 'IOS_APP_PATH'): void {
  const plain = (value: string): PropertyDescriptor => ({value, enumerable: true, writable: true, configurable: true})
  Object.defineProperty(caps, 'appium:app', {
    enumerable: true,
    configurable: true,
    get(): string {
      const value = appPathFromEnv(name)
      Object.defineProperty(caps, 'appium:app', plain(value))
      return value
    },
    set(value: string) {
      Object.defineProperty(caps, 'appium:app', plain(value))
    },
  })
}

// `as` plutôt qu'une annotation : les capabilities Appium non standard ne sont pas dans les types @wdio/types.
export const androidCapabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  ...(process.env.ANDROID_UDID ? {'appium:udid': process.env.ANDROID_UDID} : {}),
  ...(process.env.ANDROID_SYSTEM_PORT ? {'appium:systemPort': Number(process.env.ANDROID_SYSTEM_PORT)} : {}),
  ...(process.env.ANDROID_CHROMEDRIVER_PORT ? {'appium:chromedriverPort': Number(process.env.ANDROID_CHROMEDRIVER_PORT)} : {}),
  'appium:appPackage': preprod ? 'fr.gouv.ami.preprod' : 'fr.gouv.ami.staging',
  'appium:appActivity': 'fr.gouv.ami.MainActivity',
  'appium:noReset': true,
  'appium:fullReset': false,
  'appium:newCommandTimeout': 240,
  'appium:androidInstallTimeout': 90000,
  'appium:autoGrantPermissions': true,
  'appium:disableWindowAnimation': true,
  'appium:chromedriverAutodownload': true,
  'appium:showChromedriverLog': true,
  'appium:uiautomator2ServerLaunchTimeout': 60000,
  'appium:uiautomator2ServerInstallTimeout': 60000,
} as WebdriverIO.Capabilities
withLazyAppPath(androidCapabilities, 'ANDROID_APP_PATH')

export const iosCapabilities = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  ...(process.env.IOS_UDID ? {'appium:udid': process.env.IOS_UDID} : {}),
  ...(process.env.IOS_WDA_PORT ? {'appium:wdaLocalPort': Number(process.env.IOS_WDA_PORT)} : {}),
  'appium:bundleId': preprod ? 'fr.gouv.ami.preproduction' : 'fr.gouv.ami.staging',
  'appium:noReset': true,
  'appium:fullReset': false,
  'appium:isHeadless': true,
  'appium:newCommandTimeout': 240,
  'appium:wdaLaunchTimeout': 120000,
  'appium:wdaConnectionTimeout': 120000,
  'appium:shouldTerminateApp': false,
  'appium:forceAppLaunch': false,
  'appium:autoAcceptAlerts': false,
  'appium:webviewConnectRetries': Number(process.env.IOS_WEBVIEW_RETRIES ?? 3),
} as WebdriverIO.Capabilities
withLazyAppPath(iosCapabilities, 'IOS_APP_PATH')
