import type { Options } from '@wdio/types'
import path from 'path'
import fs from 'fs'

// Charge un fichier .env dans process.env sans dépendance externe.
// Les variables déjà définies dans le shell ne sont pas écrasées.
function loadDotenv(filepath: string): void {
  if (!fs.existsSync(filepath)) return
  for (const line of fs.readFileSync(filepath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eqIdx = trimmed.indexOf('=')
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

// Charge les variables NOTIF_* depuis maestro/.env (secrets, non commité)
loadDotenv(path.resolve(__dirname, '../maestro/.env'))
// Charge le .env racine (ANDROID_SDK_ROOT)
loadDotenv(path.resolve(__dirname, '../.env'))

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
      const png = await browser.takeScreenshot()
      const dir = path.resolve(__dirname, '.wdio-logs/screenshots')
      fs.mkdirSync(dir, { recursive: true })
      const name = test.title.replace(/[^a-z0-9]/gi, '_').slice(0, 80)
      fs.writeFileSync(path.join(dir, `${name}_${Date.now()}.png`), Buffer.from(png, 'base64'))
    }
  },
}
