import type { Options } from '@wdio/types'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import AllureReporter from '@wdio/allure-reporter'
import logger from '@wdio/logger'
import { registerReplHelpers } from './src/helpers/repl'
import { testSuites } from './test-suites'

const log = logger('scenario')

// Les variables déjà définies dans le shell ne sont pas écrasées (override: false).
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: false })

export const baseConfig: Partial<Options.Testrunner> = {
  runner: 'local',

  specs: (() => {
    const suiteName = process.env.WDIO_SUITE
    if (suiteName) {
      const suite = testSuites[suiteName]
      if (!suite) throw new Error(
        `Suite inconnue : "${suiteName}". Suites disponibles : ${Object.keys(testSuites).join(', ')}`
      )
      log.warn(`On utilise la suite ${suiteName}:`, suite)
      return suite
    }
    return [path.resolve(__dirname, 'src/tests/**/*.test.ts')]
  })(),

  exclude: [],

  maxInstances: 1, // Appium ne supporte pas bien la parallélisation sur un même device

  // 'warn' supprime les logs COMMAND/DATA/RESULT d'Appium (niveau info) qui
  // parasitent la sortie console sans valeur ajoutée lors d'une exécution normale.
  // Passer à 'info' ou 'debug' ponctuellement pour diagnostiquer un test flaky.
  logLevel: 'warn',

  // Le logger 'page-object' (traced()) reste à 'info' même si le niveau
  // global est 'warn', pour tracer les appels de méthodes de Page Object
  // sans réactiver le bruit Appium.
  logLevels: {
    'page-object': 'info',
    'scenario': 'info',
  },

  bail: 0,

  waitforTimeout: 15000,

  connectionRetryTimeout: 120000,

  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: [
    'spec',
    ['allure', {
      outputDir: 'allure-results',
      disableWebdriverStepsReporting: false, // commandes WDIO bas niveau visibles dans le rapport
      addConsoleLogs: true,                  // inclut console.log/warn/error — utile pour tracer
                                              // les context switches et les erreurs réseau côté SPA
    }],
  ],

  // specFileRetries relance le fichier de spec entier dans un nouveau processus Appium
  // (session fraîche, logs propres par tentative) contrairement à mochaOpts.retries
  // qui réutilise la même session et répète les logs dans le même flux de sortie.
  specFileRetries: 0,
  specFileRetriesDelay: 0,

  mochaOpts: {
    ui: 'bdd',
    // WDIO_DEBUG=1 : timeout Mocha étendu à 24 h pour browser.debug() (session REPL).
    //`timeout: 0` arrête le test.
    // borwser.debug(timeout) ne modifie pas le timeout Mocha.
    timeout: process.env.WDIO_DEBUG ? 24 * 60 * 60 * 1000 : 120000,
  },

  // Hooks globaux
  beforeSuite: (suite): void => {
    log.info(`-> describe : ${suite.title}`)
  },

  beforeTest: (test): void => {
    log.info(`  -> it : ${test.title}`)
  },

  before: async (): Promise<void> => {
    // Expose les helpers d'inspection sur globalThis pour le REPL browser.debug().
    // Tape `help()` dans le REPL pour voir la liste complète.
    registerReplHelpers()
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
    } catch (err) {
      log.warn('takeScreenshot a échoué (session Appium fermée ?)', err)
    }
    // Captures de débogage selon le contexte courant — sans changement de contexte (évite le blocage iOS ~25 s)
    try {
      const ctx = await browser.getContext()
      const ctxName = typeof ctx === 'string' ? ctx : ((ctx as { id?: string })?.id ?? '')
      if (ctxName.startsWith('WEBVIEW')) {
        const html = await browser.getPageSource()
        await AllureReporter.addAttachment('DOM snapshot (WebView)', html, 'text/html')

        // Éléments interactifs WebView — sélecteurs Testing Library suggérés
        const selectors = await browser.execute((): string[] => {
          const SELECTOR = [
            'button:not([disabled])', 'a[href]',
            'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])',
            '[role="button"]', '[role="link"]', '[role="menuitem"]',
            '[role="tab"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
          ].join(', ')
          const seen = new Set<string>()
          const result: string[] = []
          document.querySelectorAll(SELECTOR).forEach((el) => {
            const tag = el.tagName.toLowerCase()
            const role = el.getAttribute('role') ?? ''
            const ariaLabel = el.getAttribute('aria-label') ?? ''
            const text = ((el as HTMLElement).textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
            const placeholder = (el as HTMLInputElement).placeholder ?? ''
            const inputType = (el as HTMLInputElement).type ?? ''
            const n = ariaLabel || text || placeholder
            let s = ''
            if (tag === 'button' || role === 'button') {
              s = n ? `getByRole('button', { name: '${n}' })` : "getByRole('button')"
            } else if (tag === 'a' || role === 'link') {
              s = n ? `getByRole('link', { name: '${n}' })` : "getByRole('link')"
            } else if (tag === 'input') {
              if (inputType === 'checkbox' || role === 'checkbox') s = n ? `getByRole('checkbox', { name: '${n}' })` : "getByRole('checkbox')"
              else if (inputType === 'radio' || role === 'radio') s = n ? `getByRole('radio', { name: '${n}' })` : "getByRole('radio')"
              else if (placeholder) s = `getByPlaceholderText('${placeholder}')`
              else s = n ? `getByRole('textbox', { name: '${n}' })` : "getByRole('textbox')"
            } else if (tag === 'select') {
              s = n ? `getByRole('combobox', { name: '${n}' })` : "getByRole('combobox')"
            } else if (tag === 'textarea') {
              s = n ? `getByRole('textbox', { name: '${n}' })` : "getByRole('textbox')"
            } else if (role) {
              s = n ? `getByRole('${role}', { name: '${n}' })` : `getByRole('${role}')`
            } else if (n) {
              s = `getByText('${n}')`
            }
            if (s && !seen.has(s)) { seen.add(s); result.push(s) }
          })
          return result.slice(0, 40)
        }) as string[]
        if (selectors.length > 0) {
          await AllureReporter.addAttachment('Éléments interactifs (WebView)', selectors.join('\n'), 'text/plain')
        }
      } else {
        // Natif : extrait les éléments cliquables/accessibles depuis le XML Appium
        const xml = await browser.getPageSource()
        const lines: string[] = []
        if (browser.isIOS) {
          const INTERACTIVE = new Set([
            'XCUIElementTypeButton', 'XCUIElementTypeTextField',
            'XCUIElementTypeSecureTextField', 'XCUIElementTypeSwitch',
            'XCUIElementTypeLink', 'XCUIElementTypeCell',
          ])
          for (const m of xml.matchAll(/<(\w+)\s([^>]*?)\/?>/g)) {
            const [, type, attrs] = m
            if (!INTERACTIVE.has(type)) continue
            const accId = attrs.match(/\bname="([^"]+)"/)?.[1] ?? ''
            const label = attrs.match(/\blabel="([^"]+)"/)?.[1] ?? ''
            const roleHint = type.replace('XCUIElementType', '')
            const line = accId
              ? `~'${accId}'${label && label !== accId ? `  ("${label}")` : ''}  [${roleHint}]`
              : label ? `getByText('${label}')  [${roleHint}]` : null
            if (line) lines.push(line)
          }
        } else {
          for (const m of xml.matchAll(/<\w[^>]*clickable="true"[^>]*>/g)) {
            const tag = m[0]
            const desc = tag.match(/content-desc="([^"]+)"/)?.[1] ?? ''
            const text = tag.match(/\btext="([^"]+)"/)?.[1] ?? ''
            const resourceId = tag.match(/resource-id="([^"]+)"/)?.[1] ?? ''
            const display = desc || text
            const idSuffix = resourceId.split('/').pop() ?? ''
            const line = display
              ? `~'${display}'${idSuffix ? `  (id: ${idSuffix})` : ''}`
              : resourceId ? `id('${resourceId}')` : null
            if (line) lines.push(line)
          }
        }
        const unique = [...new Set(lines)].slice(0, 40)
        if (unique.length > 0) {
          await AllureReporter.addAttachment('Éléments interactifs (natif)', unique.join('\n'), 'text/plain')
        }
      }
    } catch (err) {
      log.warn('capture de débogage impossible (contexte perdu ou session fermée ?)', err)
    }
  },
}
