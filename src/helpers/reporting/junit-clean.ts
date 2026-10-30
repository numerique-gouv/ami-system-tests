import fs from 'fs'
import path from 'path'
import {enrichRunXml, readDumps} from './junit-join'

/**
 * Retire du JUnit les lignes `COMMAND:` / `RESULT:` que le reporter ajoute sans option pour les désactiver.
 *
 * Ce sont les commandes WebDriver du client WDIO (pas les logs d'Appium), que `@wdio/reporter` empile dans chaque test et que
 * `@wdio/junit-reporter` écrit toutes dans le `<system-out>`. Elles n'apportent rien au diagnostic. Exemples relevés sur un run
 * webapp : `COMMAND: GET /session/<id>/screenshot - {}` (213 fois), `/window` (186), `/url` (101), `/title` (71), chacune suivie
 * d'un `RESULT: {}` vide. Sur ce run, elles font 80 % des lignes du fichier (1204 sur 1505). Ce qui raconte le scénario, c'est la
 * console du worker (`-> it`, `page-object: call …`), conservée par `addWorkerLogs`.
 *
 * Filtrer le XML après coup plutôt que sous-classer le reporter : on ne dépend d'aucune méthode privée du reporter, donc rien à
 * revoir à une montée de version de `@wdio/junit-reporter`.
 */
const RAW_LINE = /^(COMMAND|RESULT): /
const SEPARATOR = '...command output...'

export function stripRawCommandLogs(junitDir: string): number {
  if (!fs.existsSync(junitDir)) return 0
  let cleaned = 0
  for (const file of fs.readdirSync(junitDir).filter(f => f.endsWith('.xml'))) {
    const full = path.join(junitDir, file)
    const xml = fs.readFileSync(full, 'utf8')
    const out = xml.replace(/(<system-out><!\[CDATA\[)([\s\S]*?)(\]\]><\/system-out>)/g, (_match, open: string, body: string, close: string) =>
      open + body.split('\n').filter(line => !RAW_LINE.test(line) && line.trim() !== SEPARATOR).join('\n').replace(/\n{3,}/g, '\n\n') + close)
    if (out !== xml) {
      fs.writeFileSync(full, out)
      cleaned++
    }
  }
  return cleaned
}

/**
 * Fusionne les `results-<run>-<cid>.xml` (un par worker) en un `results-<run>.xml` avec un `<testsuite>` par fichier de spec, enrichi par junit-join.ts.
 *
 * Pourquoi plusieurs fichiers à fusionner : WDIO lance un worker (donc une session et un reporter) par fichier de spec, et chaque
 * reporter écrit son propre XML. C'est voulu. Un worker par spec permet de relancer une spec seule (`specFileRetries`, `--spec`) et
 * de repartir d'une app redémarrée quand le test précédent a laissé un état instable. Grouper les specs dans un seul worker
 * (`specs: [[a, b]]`) donnerait un seul rapport, mais interdirait de relancer une spec seule, et l'instabilité d'une spec se
 * propagerait à toutes les suivantes. Il faut donc plusieurs workers, donc plusieurs rapports JUnit, d'où ce code utilitaire
 * (écrit avec une IA) qui les réunit en un rapport par run.
 */
interface SpecSuite {
  name: string
  timestamp: string
  time: number
  failures: number
  errors: number
  skipped: number
  properties: string[]
  cases: string[]
}

function attr(attributes: string, name: string): string {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? ''
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export function mergeRunReports(junitDir: string, runName: string, runDir?: string): string | null {
  if (!fs.existsSync(junitDir)) return null
  const escapedRun = runName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = fs.readdirSync(junitDir)
    .filter(f => new RegExp(`^results-${escapedRun}-\\d+-\\d+\\.xml$`).test(f))
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
  if (parts.length === 0) return null

  const specs = new Map<string, SpecSuite>()
  for (const part of parts) {
    const xml = fs.readFileSync(path.join(junitDir, part), 'utf8')
    for (const suite of xml.matchAll(/<testsuite ([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
      const [, attributes, body] = suite
      const properties = [...body.matchAll(/<property name="([^"]*)" value="([^"]*)"\/>/g)].map(m => ({name: m[1], value: m[2]}))
      const file = properties.find(p => p.name === 'file')?.value ?? ''
      const specName = file ? path.basename(file) : attr(attributes, 'name')
      const merged = specs.get(specName) ?? {name: specName, timestamp: attr(attributes, 'timestamp'), time: 0, failures: 0, errors: 0, skipped: 0, properties: [], cases: []}
      merged.time += Number(attr(attributes, 'time')) || 0
      merged.failures += Number(attr(attributes, 'failures')) || 0
      merged.errors += Number(attr(attributes, 'errors')) || 0
      merged.skipped += Number(attr(attributes, 'skipped')) || 0
      for (const p of properties) {
        const line = `<property name="${p.name}" value="${p.value}"/>`
        if (p.name !== 'specId' && !merged.properties.includes(line)) merged.properties.push(line)
      }
      for (const testCase of body.matchAll(/<testcase\b[^>]*?\/>|<testcase\b[\s\S]*?<\/testcase>/g)) {
        merged.cases.push(testCase[0].replace(/(<testcase\b[^>]*?\bclassname=)"[^"]*"/, `$1"${escapeAttr(specName)}"`))
      }
      specs.set(specName, merged)
    }
  }

  const suites = [...specs.values()]
  const total = (key: 'failures' | 'errors' | 'skipped'): number => suites.reduce((n, s) => n + s[key], 0)
  const tests = suites.reduce((n, s) => n + s.cases.length, 0)
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${tests}" failures="${total('failures')}" errors="${total('errors')}" skipped="${total('skipped')}">`,
    ...suites.map(s => [
      `  <testsuite name="${escapeAttr(s.name)}" timestamp="${s.timestamp}" time="${Math.round(s.time * 1000) / 1000}" tests="${s.cases.length}" failures="${s.failures}" errors="${s.errors}" skipped="${s.skipped}">`,
      '    <properties>',
      ...s.properties.map(p => `      ${p}`),
      '    </properties>',
      ...s.cases.map(c => `    ${c}`),
      '  </testsuite>',
    ].join('\n')),
    '</testsuites>',
    '',
  ].join('\n')

  const dumps = runDir ? readDumps(runDir, path.dirname(junitDir)) : []
  const enriched = enrichRunXml(out, {runName, dumps, amiEnv: process.env.AMI_ENV ?? null})

  const merged = path.join(junitDir, `results-${runName}.xml`)
  fs.writeFileSync(merged, enriched)
  for (const part of parts) fs.rmSync(path.join(junitDir, part))
  return merged
}
