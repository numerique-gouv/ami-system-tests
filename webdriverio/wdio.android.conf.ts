import type { Options } from '@wdio/types'
import { baseConfig } from './wdio.base.conf'
import { androidCapabilities } from './src/driver/capabilities'

export const config: Options.Testrunner = {
  ...baseConfig,

  capabilities: [androidCapabilities],

  services: [
    [
      'appium',
      {
        command: 'appium',
        args: {
          port: 4723,
          relaxedSecurity: false,
          log: '.wdio-logs/appium-android.log',
        },
      },
    ],
  ],

  port: 4723,
} as Options.Testrunner
