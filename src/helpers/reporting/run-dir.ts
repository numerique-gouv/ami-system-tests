import path from 'path'

/**
 * Nom du dossier d'un run pour les artefacts du service DevTools (`@wdio/devtools-service`) : `<horodatage>_<plateforme>_<suite ou spec>`.
 * Le service écrit ses traces sous `<rootDir>/test-results/`, dans des dossiers dont le nom ne dépend ni de la date ni de la plateforme ni
 * du run (`<spec>_test-<test>-…/trace`) : deux runs du même test dans le même dossier s'écraseraient. Chaque run reçoit donc son propre
 * `rootDir` (cf. `traceRootDir` dans wdio.base.conf.ts), ce qui donne `test-results/traces/<run>/test-results/<spec>_test-…/trace/`.
 */

/** Horodatage UTC sans caractère interdit dans un nom de dossier, à la milliseconde (même forme que les dossiers de `failures/`). */
export function runTimestamp(startedAtMs: number): string {
  return new Date(startedAtMs).toISOString().replace(/[:.]/g, '-')
}

function slug(text: string): string {
  return text.replace(/[^a-z0-9+.-]/gi, '_').replace(/_+/g, '_').slice(0, 60)
}

/** Suite nommée (`--suite NOM` ou `--suite=NOM`, option native de WDIO ; la première), sinon les fichiers de spec passés avec `--spec` (le premier, puis `+N`), sinon `all`. */
export function runScope(argv: string[]): string {
  const suite = argv.flatMap((arg, i) => arg === '--suite' && argv[i + 1] ? [argv[i + 1]] : arg.startsWith('--suite=') ? [arg.slice(8)] : [])[0]
  if (suite) return slug(suite)
  const specs = argv.flatMap((arg, i) => arg === '--spec' && argv[i + 1] ? [argv[i + 1]] : arg.startsWith('--spec=') ? [arg.slice(7)] : [])
  if (specs.length === 0) return 'all'
  const first = path.basename(specs[0]).replace(/\.(test|e2e)\.[cm]?[jt]s$|\.[cm]?[jt]s$/, '')
  return slug(specs.length > 1 ? `${first}+${specs.length - 1}` : first)
}

export function runDirName(platform: 'android' | 'ios' | 'webapp', startedAtMs: number, argv: string[]): string {
  return `${runTimestamp(startedAtMs)}_${platform}_${runScope(argv)}`
}
