import path from 'path'

/** Chaque run a son dossier `<horodatage>_<plateforme>_<suite ou spec>` : sinon deux runs du même test s'écraseraient. */
function runTimestamp(startedAtMs: number): string {
  return new Date(startedAtMs).toISOString().replace(/[:.]/g, '-')
}

function slug(text: string): string {
  return text.replace(/[^a-z0-9+.-]/gi, '_').replace(/_+/g, '_').slice(0, 60)
}

/** Première `--suite`, sinon le premier `--spec` (puis `+N`), sinon `all`. */
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
