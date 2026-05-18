import type { Options } from '@wdio/types'
import { baseConfig } from './wdio.base.conf'
import { iosCapabilities } from './src/driver/capabilities'

export const config: Options.Testrunner = {
  ...baseConfig,

  capabilities: [iosCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: 4724, // port différent pour éviter tout conflit avec Android
          relaxedSecurity: false,
          log: '.wdio-logs/appium-ios.log',
        },
      },
    ],
  ],

  port: 4724,
} as Options.Testrunner
