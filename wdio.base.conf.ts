import type { Options } from '@wdio/types'
import path from 'path'
import dotenv from 'dotenv'
import logger from '@wdio/logger'
import { dumpFailure } from './src/helpers/reporting/failure-dump'
import { resetSteps } from './src/helpers/reporting/report'
import { mergeRunReports, stripRawCommandLogs } from './src/helpers/reporting/junit-clean'
import { redactTraces } from './src/helpers/reporting/trace-redact'
import { runDirName } from './src/helpers/reporting/run-dir'

const log = logger('scenario')

/**
 * `rootDir` de ce run, propre à chaque exécution : le service DevTools écrit ses traces sous `<rootDir>/test-results/`, donc dans
 * `test-results/traces/<horodatage>_<plateforme>_<suite ou spec>/test-results/` (cf. helpers/reporting/run-dir.ts). Calculé une seule fois par le
 * lanceur ; les workers, qui relisent la config avec d'autres arguments, héritent la valeur par l'environnement.
 * `rootDir` ne sert à WDIO qu'à résoudre des chemins relatifs de specs : les nôtres sont absolus.
 */
export function traceRootDir(platform: 'android' | 'ios' | 'webapp'): string {
  process.env.WDIO_RUN_DIR ??= path.resolve(__dirname, 'test-results/traces', runDirName(platform, Date.now(), process.env, process.argv))
  return process.env.WDIO_RUN_DIR
}

/**
 * Nombre de relances d'un fichier de spec en échec : `WDIO_SPEC_FILE_RETRIES` (entier ≥ 0) s'il est défini, sinon 1 dans un job de CI
 * (`CI` ou `GITHUB_ACTIONS` non vide et différent de « false »/« 0 »), sinon 0 (poste local, mesures).
 */
export function specFileRetriesFromEnv(env: NodeJS.ProcessEnv): number {
  const explicit = env.WDIO_SPEC_FILE_RETRIES?.trim()
  if (explicit) {
    const n = Number(explicit)
    if (!Number.isInteger(n) || n < 0) throw new Error(`WDIO_SPEC_FILE_RETRIES doit être un entier >= 0 (reçu « ${explicit} »)`)
    return n
  }
  const isCi = [env.CI, env.GITHUB_ACTIONS].some((v) => v !== undefined && !['', 'false', '0'].includes(v.toLowerCase()))
  return isCi ? 1 : 0
}

// Les variables déjà définies dans le shell ne sont pas écrasées (override: false).
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: false })

// Service DevTools en mode trace, écrit dans test-results/ : captures, arbre de l'écran, éléments et réseau d'un test en échec
// (failure-dump.ts n'écrit plus que le contexte). Toutes les options sont écrites, même à leur
// valeur par défaut. Une trace par test, gardée si ce test échoue ou est rejoué (un échec dans un hook `before` n'a pas de
// frontière de test : le service retombe alors sur une trace de session) ; contenu : transcript.md, captures et arbre de l'écran à chaque action, locators des éléments, réseau (masqué
// par helpers/reporting/trace-redact.ts en fin de run).
export const traceServices: NonNullable<Options.Testrunner['services']> = [
  ['devtools', {
    mode: 'trace',
    traceFormat: 'ndjson-directory',
    traceGranularity: 'test',
    tracePolicy: 'retain-on-failure-and-retries',
    screenshot: 'only-on-failure',  // capture du test en échec (exige traceGranularity 'test')
    // Vidéo : désactivée ici. La config DevTools « vidéo » est wdio.webapp.with_video.conf.ts (`just test-webvideo`).
    video: 'off',
    filmstrip: false,
    captureAssertions: true,
    emitArtifactsManifest: true,
  }],
]

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
    // JUnit XML : résumé passants/cassés (commentaire de PR et artefact de CI). Un fichier par processus pendant le run
    // (`results-<run>-<cid>.xml`), fusionnés par onComplete en `results-<run>.xml` : un rapport par run, un testsuite par spec.
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
        // Nommé par run (même nom que le dossier du run : horodatage, plateforme, suite ou spec) : deux runs ne s'écrasent pas.
        const run = process.env.WDIO_RUN_DIR ? path.basename(process.env.WDIO_RUN_DIR) : target
        return `results-${run}-${options.cid}.xml`
      },
    }],
  ],

  // specFileRetries relance le fichier de spec entier dans un nouveau processus Appium
  // (session fraîche, logs propres par tentative) contrairement à mochaOpts.retries
  // qui réutilise la même session et répète les logs dans le même flux de sortie.
  // Valeur pilotée par l'environnement (specFileRetriesFromEnv) : 0 par défaut et pour les mesures (campagnes de stabilité, poste local),
  // 1 dans un job de CI (GitHub Actions pose CI=true). Forçable par WDIO_SPEC_FILE_RETRIES=N, et --specFileRetries=N en ligne de commande
  // l'emporte sur la config. Un échec rejoué à l'identique = bug reproductible ; passé au 2e essai = test instable.
  // La trace du premier essai est gardée (tracePolicy 'retain-on-failure-and-retries').
  specFileRetries: specFileRetriesFromEnv(process.env),
  specFileRetriesDelay: 0,

  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  // Hooks globaux
  beforeSuite: (suite): void => {
    log.info(`-> describe : ${suite.title}`)
  },

  // Une fois tous les fichiers JUnit et toutes les traces écrits : retire les lignes brutes COMMAND/RESULT (cf. helpers/reporting/junit-clean.ts)
  // et masque cookies, jetons et secrets des traces DevTools (cf. helpers/reporting/trace-redact.ts).
  onComplete: (): void => {
    const junitDir = path.resolve(__dirname, 'test-results/junit')
    stripRawCommandLogs(junitDir)
    // Un seul rapport JUnit par run, un testsuite par fichier de spec (cf. helpers/reporting/junit-clean.ts).
    if (process.env.WDIO_RUN_DIR) mergeRunReports(junitDir, path.basename(process.env.WDIO_RUN_DIR), process.env.WDIO_RUN_DIR)
    // Seulement le dossier de CE run : un autre run en cours écrit peut-être encore dans le sien.
    redactTraces(process.env.WDIO_RUN_DIR ?? path.resolve(__dirname, 'test-results'))
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

  // Contexte d'un test en échec (étapes, erreur, appareil, lien Sentry) : voir helpers/reporting/failure-dump.ts. Captures et réseau : service DevTools.
  afterTest: async (test, _context, result): Promise<void> => {
    if (result.passed) return
    await dumpFailure(test, result.error)
  },
}
