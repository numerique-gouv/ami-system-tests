/* eslint-disable no-console -- script CLI hors session de test : la sortie console est son produit (cf. CONTRIBUTING.md, scripts CLI) */
/**
 * Liste les tests en échec d'un run : pour chacun, plateforme, étapes, erreur, URL, identifiants Sentry (context.json du dossier de dump)
 * et chemin du `transcript.md` de sa trace DevTools (texte brut des étapes, lisible dans un éditeur ou un commentaire de PR).
 *
 * Lancement : `just failures-text [DOSSIER]` ou `npx ts-node --project tsconfig.json src/scripts/failures-text.ts [DOSSIER]`.
 * DOSSIER : un dossier de dumps, un dossier de run, ou tout dossier qui en contient (ex. l'artefact d'un run de CI téléchargé).
 * Sans DOSSIER : le dernier run de test-results/traces/ qui a des dumps (les noms de run commencent par l'horodatage : tri alphabétique =
 * chronologique), sinon test-results/failures.
 */
import fs from 'fs'
import path from 'path'

interface FailureContext {
  test: string
  platform?: string
  device?: {deviceName?: string}
  failedAtUtc?: string
  error?: {message?: unknown}
  url?: string
  steps?: string[]
  sentry?: {url?: string, lastEventId?: string, environment?: string}
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function subdirs(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => path.join(dir, entry.name))
}

/** Dossiers de dump (ceux qui contiennent un context.json) sous `dir`, triés. */
function findDumps(dir: string): string[] {
  if (fs.existsSync(path.join(dir, 'context.json'))) return [dir]
  return subdirs(dir).flatMap(findDumps).sort()
}

function latestRootWithDumps(): string {
  const tracesRoot = 'test-results/traces'
  const runs = fs.existsSync(tracesRoot) ? subdirs(tracesRoot).filter(run => fs.existsSync(path.join(run, 'failures'))).sort() : []
  const latest = runs.at(-1)
  return latest ? path.join(latest, 'failures') : 'test-results/failures'
}

/** Tous les `transcript.md` sous `dir`. */
function findTranscripts(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return findTranscripts(full)
    return entry.name === 'transcript.md' ? [full] : []
  })
}

/**
 * Transcript de la trace d'un test. Une trace par test est dans `<run>/test-results/<spec>_test-<titre du test tronqué>-<navigateur>-<hash>/trace/` :
 * on retient la trace dont le titre tronqué est le début du titre (slug) du test. Le run est le premier ancêtre du dump qui a un dossier `test-results`.
 */
function transcriptOf(dump: string, test: string): string | undefined {
  let run = path.dirname(dump)
  while (!fs.existsSync(path.join(run, 'test-results')) && path.dirname(run) !== run) run = path.dirname(run)
  const wanted = slug(test)
  return findTranscripts(path.join(run, 'test-results')).find(file => {
    const folder = path.relative(path.join(run, 'test-results'), file).split(path.sep)[0] ?? ''
    const title = slug(folder.replace(/^.*?_test-/, '').replace(/-[a-z]+-[a-z0-9]{6}$/, ''))
    return title.length > 0 && wanted.startsWith(title)
  })
}

function main(): void {
  const root = process.argv[2] || latestRootWithDumps()
  if (!fs.existsSync(root)) {
    console.log(`Aucun dump dans ${root} (aucun échec, ou aucun run).`)
    return
  }
  const dumps = findDumps(root)
  if (dumps.length === 0) {
    console.log(`Aucun dump dans ${root}`)
    return
  }
  for (const dump of dumps) {
    const c = JSON.parse(fs.readFileSync(path.join(dump, 'context.json'), 'utf8')) as FailureContext
    const device = c.device?.deviceName ? ` · ${c.device.deviceName}` : ''
    console.log(`✖ ${c.test}  [${c.platform}${device}]  ${c.failedAtUtc}`)
    if (c.error) {
      const lines = String(c.error.message).split('\n').filter(Boolean)
      console.log(`    erreur : ${(lines[0] ?? '').slice(0, 200)}`)
      for (const line of lines.slice(1, 12)) console.log(`             ${line.slice(0, 200)}`)
    }
    if (c.url) console.log(`    url    : ${c.url}`)
    if (c.steps?.length) console.log(`    étapes : ${c.steps.join(' › ')}`)
    if (c.sentry) console.log(`    sentry : ${c.sentry.url ?? 'trace inconnue'} · dernier événement ${c.sentry.lastEventId} · ${c.sentry.environment}`)
    console.log(`    transcript : ${transcriptOf(dump, c.test) ?? '(aucune trace pour ce test)'}`)
    console.log(`    dossier: ${dump}`)
  }
}

main()
