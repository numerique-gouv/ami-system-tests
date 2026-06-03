import type { Options } from '@wdio/types'
import path from 'path'
import fs from 'fs'
import AllureReporter from '@wdio/allure-reporter'

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

  // 'warn' supprime les logs COMMAND/DATA/RESULT d'Appium (niveau info) qui
  // parasitent la sortie console sans valeur ajoutée lors d'une exécution normale.
  // Passer à 'info' ou 'debug' ponctuellement pour diagnostiquer un test flaky.
  logLevel: 'info',

  bail: 0,

  waitforTimeout: 15000,

  connectionRetryTimeout: 120000,

  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: [
    'spec',
    ['allure', { outputDir: 'allure-results', disableWebdriverStepsReporting: false, addConsoleLogs: true }],
  ],

  // specFileRetries relance le fichier de spec entier dans un nouveau processus Appium
  // (session fraîche, logs propres par tentative) contrairement à mochaOpts.retries
  // qui réutilise la même session et répète les logs dans le même flux de sortie.
  specFileRetries: 0,
  specFileRetriesDelay: 0,

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // 2 min par test — les apps natives peuvent être lentes au démarrage
  },

  // Hooks globaux
  before: async (): Promise<void> => {
    // Espace pour des initialisations globales (ex: login, seed de données)
  },

  afterTest: async (test, _context, result): Promise<void> => {
    if (result.passed) return
    try {
      const png = await browser.takeScreenshot()
      await AllureReporter.addAttachment('Screenshot (échec)', Buffer.from(png, 'base64'), 'image/png')
      // Conserve aussi sur disque pour les workflows hors Allure (CI logs)
      const dir = path.resolve(__dirname, '.wdio-logs/screenshots')
      fs.mkdirSync(dir, { recursive: true })
      const name = test.title.replace(/[^a-z0-9]/gi, '_').slice(0, 80)
      fs.writeFileSync(path.join(dir, `${name}_${Date.now()}.png`), Buffer.from(png, 'base64'))
    } catch {
      // Un crash de takeScreenshot (ex : session Appium fermée) ne doit pas masquer l'erreur du test
    }
    // DOM snapshot uniquement en WebView — évite le blocage ~25 s sur iOS hors contexte stabilisé
    // et la page source XML native qui est lourde et inutile pour le débogage
    try {
      const ctx = await browser.getContext()
      const ctxName = typeof ctx === 'string' ? ctx : ((ctx as { id?: string })?.id ?? '')
      if (ctxName.startsWith('WEBVIEW')) {
        const html = await browser.getPageSource()
        await AllureReporter.addAttachment('DOM snapshot (WebView)', html, 'text/html')
      }
    } catch {
      // idem — un échec de capture DOM ne doit jamais masquer l'erreur du test
    }
  },
}
