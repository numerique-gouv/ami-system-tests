import type { Options } from '@wdio/types'
import path from 'path'
import dotenv from 'dotenv'
import logger from '@wdio/logger'
import { dumpFailure } from './src/helpers/failure-dump'
import { resetSteps } from './src/helpers/report'
import { stripRawCommandLogs } from './src/helpers/junit-clean'

const log = logger('scenario')

// Les variables déjà définies dans le shell ne sont pas écrasées (override: false).
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: false })

// `specs` n'est PAS définie ici : chaque config de plateforme (wdio.android.conf.ts,
// wdio.ios.conf.ts, wdio.webapp.conf.ts) appelle resolveSpecs() de test-suites.ts avec
// son propre glob par défaut — mobile et webapp n'ont pas le même arbre sous src/tests/.
export const baseConfig: Partial<Options.Testrunner> = {
  runner: 'local',

  exclude: [],

  maxInstances: 1, // Appium ne supporte pas bien la parallélisation sur un même device

  // 'warn' supprime les logs COMMAND/DATA/RESULT d'Appium (niveau info) qui
  // parasitent la sortie console sans valeur ajoutée lors d'une exécution normale.
  // Passer à 'info' ou 'debug' ponctuellement pour diagnostiquer un test flaky.
  logLevel: 'warn',

  // Chaque logger nommé (voir CONTRIBUTING.md §1bis) reste à 'info'
  // même si le niveau global est 'warn', pour tracer page objects/tests/api/config
  // sans réactiver le bruit Appium (niveau info du logger par défaut).
  logLevels: {
    'page-object': 'info',
    'scenario': 'info',
    'test': 'info',
    'api': 'info',
    'config': 'info',
    'helper': 'info',
    'access-code': 'info',
  },

  bail: 0,

  waitforTimeout: 15000,

  connectionRetryTimeout: 120000,

  connectionRetryCount: 3,

  framework: 'mocha',

  reporters: [
    'spec',
    // JUnit XML : résumé passants/cassés (commentaire de PR et artefact de CI). Un fichier par processus, nommé avec la
    // plateforme pour que les résultats des trois cibles ne s'écrasent pas quand ils sont fusionnés.
    ['junit', {
      outputDir: 'test-results/junit',
      // La console du worker (nos logs : `-> it`, appels de Page Objects, `step`, avertissements) est placée AVANT les lignes
      // brutes `COMMAND`/`RESULT` dans le `<system-out>` de chaque test : c'est elle qui raconte le scénario.
      addWorkerLogs: true,
      // Par défaut le reporter remplace tout caractère non ASCII par un espace (« Préférences » → « Pr f rences »), ce qui
      // empêche de relier un test à son dump d'échec : on garde les lettres Unicode.
      suiteNameFormat: /[^\p{L}\p{N}@]+/u,
      outputFileFormat: (options: {cid: string, capabilities: unknown}): string => {
        const caps = options.capabilities as Record<string, unknown>
        const target = String(caps.platformName ?? caps.browserName ?? 'inconnu').toLowerCase()
        return `results-${target}-${options.cid}.xml`
      },
    }],
  ],

  // specFileRetries relance le fichier de spec entier dans un nouveau processus Appium
  // (session fraîche, logs propres par tentative) contrairement à mochaOpts.retries
  // qui réutilise la même session et répète les logs dans le même flux de sortie.
  specFileRetries: 0,
  specFileRetriesDelay: 0,

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  // Hooks globaux
  beforeSuite: (suite): void => {
    log.info(`-> describe : ${suite.title}`)
  },

  // Une fois tous les fichiers JUnit écrits : retire les lignes brutes COMMAND/RESULT (cf. helpers/junit-clean.ts).
  onComplete: (): void => {
    stripRawCommandLogs(path.resolve(__dirname, 'test-results/junit'))
  },

  // Un seul callback pour les 4 hooks Mocha (before/beforeEach/after/afterEach) — hookName les
  // distingue ("before all", "before each", "after all", "after each"). test.parent porte le
  // titre du describe englobant : le titre du hook lui-même est un texte Mocha générique
  // ("before each" hook), pas discriminant.
  beforeHook: (test, _context, hookName): void => {
    log.info(`  -> ${hookName} : ${test.parent ?? test.title}`)
  },

  beforeTest: (test): void => {
    log.info(`  -> it : ${test.title}`)
    resetSteps()
  },

  // Dump systématique d'un test en échec (capture, DOM ou arbre natif, identifiants Sentry…) : voir helpers/failure-dump.ts.
  afterTest: async (test, _context, result): Promise<void> => {
    if (result.passed) return
    await dumpFailure(test, result.error)
  },
}
