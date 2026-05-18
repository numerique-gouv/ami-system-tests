import type { Options } from '@wdio/types'
import path from 'path'

export const baseConfig: Partial<Options.Testrunner> = {
  runner: 'local',

  specs: [path.resolve(__dirname, 'src/tests/**/*.test.ts')],

  exclude: [],

  maxInstances: 1, // Appium ne supporte pas bien la parallélisation sur un même device

  logLevel: 'info',

  bail: 0,

  waitforTimeout: 15000,

  connectionRetryTimeout: 120000,

  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: [
    'spec',
    // Décommentez pour activer Allure :
    // ['allure', { outputDir: 'allure-results', disableWebdriverStepsReporting: false }],
  ],

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // 2 min par test — les apps natives peuvent être lentes au démarrage
    retries: 1,
  },

  // Hooks globaux
  before: async (): Promise<void> => {
    // Espace pour des initialisations globales (ex: login, seed de données)
  },

  afterTest: async (test, _context, result): Promise<void> => {
    if (!result.passed) {
      await browser.takeScreenshot()
    }
  },
}
