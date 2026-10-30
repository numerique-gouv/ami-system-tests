/* eslint-disable wdio/no-floating-promise, no-console -- node:test (describe/it renvoient des promesses sans les attendre) */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {describe, it} from 'node:test'
import {caseOutcome, enrichRunXml, normalizeTitle, platformOfRun, readDumps, type DumpInfo} from './junit-join'

/**
 * Tests unitaires de la jointure JUnit / dumps d'échec. Lancer : `npm run test:unit`.
 * Les tests « données réelles » lisent (sans jamais écrire) les JUnit et dumps de `AMI_JUNIT_ROOT` (défaut : `test-results/` du dépôt) et
 * sont sautés si ce dossier est absent.
 */
const root = path.resolve(process.env.AMI_JUNIT_ROOT ?? 'test-results')
const junitDir = path.join(root, 'junit')
const hasReal = fs.existsSync(junitDir) && fs.readdirSync(junitDir).some(f => f.endsWith('.xml'))

function dump(title: string, over: Partial<DumpInfo> = {}): DumpInfo {
  return {title, normalizedTitle: normalizeTitle(title), suite: null, failedAtUtc: '2026-10-26T10:00:00.000Z', platform: 'webapp', contextKind: 'web',
    sentryUrl: 'https://sentry.incubateur.net/organizations/betagouv/explore/traces/trace/abc/', dumpPath: 'traces/run/failures/x__1', errorMessage: null, ...over}
}

const SYNTHETIC = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="5">
  <testsuite name="a.test.ts" tests="5">
    <properties><property name="file" value="x"/></properties>
    <testcase classname="a.test.ts" name="S1 Je veux suivre mes démarches" time="1.0"><failure message="boom"/></testcase>
    <testcase classname="a.test.ts" name="S1 Je veux suivre mes démarches" time="1.0"/>
    <testcase classname="a.test.ts" name="ok" time="1.0"/>
    <testcase classname="a.test.ts" name="saute" time="0"><skipped/></testcase>
    <testcase classname="a.test.ts" name="natif" time="2"><failure message="x"/></testcase>
  </testsuite>
</testsuites>
`

describe('normalizeTitle', () => {
  it('applique le même assainissement que le reporter JUnit (séparateurs → espace, lettres Unicode et @ conservés)', () => {
    assert.equal(normalizeTitle('S3 — « Je veux suivre mes démarches » est proposé'), 'S3 Je veux suivre mes démarches est proposé')
    assert.equal(normalizeTitle("qu'un seul"), 'qu un seul')
    assert.equal(normalizeTitle('  mail@x.fr  '), 'mail@x fr')
  })
})

describe('enrichRunXml (synthétique)', () => {
  const xml = enrichRunXml(SYNTHETIC, {runName: '2026-10-26T10-00-00-000Z_webapp_a', amiEnv: 'staging',
    dumps: [dump('S1 — Je veux suivre mes démarches'), dump('natif', {contextKind: 'native', sentryUrl: null, dumpPath: 'traces/run/failures/n__1'})]})
  it('marque instable le test échoué puis réussi, et garde failed sur le premier essai', () => {
    assert.match(xml, /name="S1 Je veux suivre mes démarches" time="1.0"><properties>(?:(?!<\/properties>).)*name="outcome" value="failed"(?:(?!<\/properties>).)*name="attempt" value="1"/s)
    assert.match(xml, /name="outcome" value="flaky"\/><property name="attempt" value="2"\/><property name="attempts" value="2"/)
  })
  it('relie le dump (dump_path, sentry_url) au premier essai échoué seulement', () => {
    assert.equal((xml.match(/name="sentry_url"/g) ?? []).length, 1)
    assert.equal((xml.match(/name="dump_path"/g) ?? []).length, 2)
  })
  it('un échec natif a context_kind=native et pas de sentry_url', () => {
    const native = xml.match(/name="natif"[^>]*>(<properties>.*?<\/properties>)/s)?.[1] ?? ''
    assert.match(native, /name="context_kind" value="native"/)
    assert.doesNotMatch(native, /sentry_url/)
  })
  it('renseigne platform et ami_env, et marque skipped / passed', () => {
    assert.match(xml, /name="platform" value="webapp"/)
    assert.match(xml, /name="ami_env" value="staging"/)
    assert.match(xml, /name="saute" time="0"><properties>.*?name="outcome" value="skipped"/s)
  })
  it('est idempotent', () => {
    assert.equal(enrichRunXml(xml, {runName: '2026-10-26T10-00-00-000Z_webapp_a', dumps: []}), xml)
  })
  it('caseOutcome / platformOfRun', () => {
    assert.equal(caseOutcome('<testcase><error/></testcase>'), 'failed')
    assert.equal(platformOfRun('2026-10-26T16-02-37-661Z_ios_profile+1'), 'ios')
    assert.equal(platformOfRun('inconnu'), null)
  })
})

describe('données réelles', {skip: !hasReal}, () => {
  const files = hasReal ? fs.readdirSync(junitDir).filter(f => /^results-.*\.xml$/.test(f)) : []
  it('enrichit sans perdre ni dupliquer un testcase, et chaque échec relié à un dump a dump_path', () => {
    let failed = 0, linked = 0, sentry = 0, total = 0
    for (const file of files) {
      const xml = fs.readFileSync(path.join(junitDir, file), 'utf8')
      if (/<properties><property/.test(xml)) continue // déjà enrichi par un run postérieur à cette fonctionnalité
      const runName = file.replace(/^results-/, '').replace(/\.xml$/, '')
      const dumps = readDumps(path.join(root, 'traces', runName), root)
      const out = enrichRunXml(xml, {runName, dumps, amiEnv: 'staging'})
      const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length
      assert.equal(count(out, /<testcase\b/g), count(xml, /<testcase\b/g), file)
      assert.equal(count(out, /<\/testcase>/g), count(out, /<testcase\b/g), `${file} : testcase non fermé`)
      assert.equal(count(out, /<properties><property name="platform"/g), count(out, /<testcase\b/g), file)
      assert.equal(count(out, /<testsuite\b/g), count(xml, /<testsuite\b/g), file)
      total += count(out, /<testcase\b/g)
      failed += count(out, /name="outcome" value="failed"/g)
      linked += count(out, /name="dump_path"/g)
      sentry += count(out, /name="sentry_url"/g)
      assert.ok(count(out, /name="dump_path"/g) <= dumps.length, `${file} : plus de dump_path que de dumps`)
      assert.equal(enrichRunXml(out, {runName, dumps, amiEnv: 'staging'}), out, `${file} : non idempotent`)
    }
    console.log(`  jointure réelle : ${files.length} JUnit, ${total} testcases, ${failed} échecs, ${linked} reliés à un dump, ${sentry} avec lien Sentry`)
    assert.ok(total > 0)
  })
})
