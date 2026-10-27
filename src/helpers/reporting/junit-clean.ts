import fs from 'fs'
import path from 'path'
import {enrichRunXml, readDumps} from './junit-join'

/**
 * Retire du JUnit XML les lignes brutes `COMMAND: …` / `RESULT: …` (et le séparateur `...command output...`) que le reporter
 * JUnit de WebdriverIO ajoute dans le `<system-out>` de chaque test. Il n'a pas d'option pour les désactiver, et elles noient la
 * console du scénario (`addWorkerLogs`) qui, elle, raconte ce qui s'est passé. Les commandes WebDriver restent dans les logs
 * Appium (`.wdio-logs/`). Appelé une fois tous les fichiers écrits (hook `onComplete` du lanceur).
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
 * Un seul rapport JUnit par run, organisé par fichier de spec : le reporter JUnit de WebdriverIO écrit un fichier par worker (donc un
 * par spec hors suite nommée) et nomme `testsuite` et `classname` d'après le titre du `describe`. Un lecteur comme celui d'IntelliJ
 * n'ouvre qu'un fichier à la fois et ne montre alors que les tests de cette spec.
 * `results-<run>-<cid>.xml` (un par worker) devient `results-<run>.xml` : un `<testsuite>` par fichier de spec, nommé comme lui
 * (`authentification.smoke.test.ts`), qui réunit les tests de tous ses `describe` ; `classname` prend le même nom, `name` reste le titre du `it`.
 * Le titre du `describe` est conservé en propriété `suiteName`. Chaque testcase reçoit en plus des `<properties>` (junit-join.ts). Appelé une fois tous les fichiers écrits (hook `onComplete`).
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

  // Propriétés par testcase (plateforme, AMI_ENV, issue, lien Sentry et dump des échecs) : cf. junit-join.ts. Sans dossier de run, pas de dumps à joindre.
  const dumps = runDir ? readDumps(runDir, path.dirname(junitDir)) : []
  const enriched = enrichRunXml(out, {runName, dumps, amiEnv: process.env.AMI_ENV ?? null})

  const merged = path.join(junitDir, `results-${runName}.xml`)
  fs.writeFileSync(merged, enriched)
  for (const part of parts) fs.rmSync(path.join(junitDir, part))
  return merged
}
