/* eslint-disable no-console -- script CLI hors session de test : la sortie console est son produit (cf. CONTRIBUTING.md, scripts CLI) */
/**
 * Ouvre dans le lecteur DevTools (captures, arbre de l'écran, réseau) la trace d'un test en échec.
 * Lancement : `just failures-ui [CIBLE] [FILTRE]` ou `npx ts-node --project tsconfig.json src/scripts/failures-ui.ts [CIBLE] [FILTRE]`.
 * CIBLE : un dossier de run (test-results/traces/<horodatage>_…), l'artefact d'une CI téléchargé, le dossier d'une trace (celui qui contient
 * trace.trace) ou un .zip ; sans CIBLE, le dernier run qui a des traces. FILTRE : sous-chaîne du chemin (donc du nom du test) quand la cible
 * en contient plusieurs. Le lecteur (`show-trace`) ne lit que des .zip, alors que les traces sont écrites en dossier (`traceFormat:
 * 'ndjson-directory'`, nécessaire à trace-redact pour masquer les jetons et autres infos de sécurité et au transcript.md lisible) : le dossier est zippé dans un dossier temporaire.
 * Le lecteur s'ouvre dans le navigateur ; Ctrl+C l'arrête.
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
    console.error(`« ${root} » introuvable.`)
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
    console.log(`📄 Transcript : ${path.join(traces[0], 'transcript.md')}`)
    zip = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trace-')), 'trace.zip')
    execFileSync('zip', ['-qr', zip, '.'], {cwd: traces[0]})
  }
  console.log("🔎 Ouverture de la trace dans le lecteur (Ctrl+C pour l'arrêter)…")
  spawnSync('npx', ['show-trace', zip], {stdio: 'inherit'})
}

main()
