/* eslint-disable no-console -- script CLI hors session de test : la sortie console est son produit (cf. CONTRIBUTING.md, scripts CLI) */
/**
 * Ouvre dans le lecteur DevTools la trace d'un test en échec. `just failures-ui [CIBLE] [FILTRE]` : CIBLE est un dossier de run ou de trace, ou un .zip
 * (par défaut le dernier run) ; FILTRE, une sous-chaîne du chemin quand la cible contient plusieurs traces. Le lecteur ne lit que des .zip :
 * le dossier de trace (nécessaire à trace-redact) est zippé dans un dossier temporaire.
 */
import {execFileSync, spawnSync} from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const [target = '', filter = ''] = process.argv.slice(2)

/** Dossiers de trace (ceux qui contiennent trace.trace) sous `dir`. */
function findTraces(dir: string): string[] {
  if (fs.existsSync(path.join(dir, 'trace.trace'))) return [dir]
  return fs.readdirSync(dir, {withFileTypes: true}).filter(e => e.isDirectory()).flatMap(e => findTraces(path.join(dir, e.name))).sort()
}

function latestRunWithTraces(): string | undefined {
  const tracesRoot = 'test-results/traces'
  if (!fs.existsSync(tracesRoot)) return undefined
  const runs = fs.readdirSync(tracesRoot).sort().map(run => path.join(tracesRoot, run))
  return runs.filter(run => fs.statSync(run).isDirectory() && findTraces(run).length > 0).at(-1)
}

function main(): void {
  const root = target || latestRunWithTraces()
  if (!root) {
    console.log('Aucune trace dans test-results/traces/ (aucun échec, ou aucun run).')
    return
  }
  if (!fs.existsSync(root)) {
    console.error(`${root} introuvable`)
    process.exitCode = 1
    return
  }
  let zip = root
  if (fs.statSync(root).isDirectory()) {
    const traces = findTraces(root).filter(t => t.includes(filter))
    if (traces.length === 0) {
      console.log(`Aucune trace dans ${root}${filter ? ` pour « ${filter} »` : ''}.`)
      return
    }
    if (traces.length > 1) {
      console.log(`${traces.length} traces dans ${root} — précisez-en une avec FILTRE (just failures-ui "${root}" <texte>) :`)
      for (const t of traces) console.log(`  - ${path.relative(root, t)}`)
      return
    }
    console.log(`Transcript : ${path.join(traces[0], 'transcript.md')}`)
    zip = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), 'trace.zip')
    execFileSync('zip', ['-qr', zip, '.'], {cwd: traces[0]})
  }
  console.log("Ouverture de la trace dans le lecteur (Ctrl+C pour l'arrêter)")
  spawnSync('npx', ['show-trace', zip], {stdio: 'inherit'})
}

main()
