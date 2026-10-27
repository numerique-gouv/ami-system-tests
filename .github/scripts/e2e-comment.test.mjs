// Tests du script de commentaire : `node --test .github/scripts/` (ou `npm run test:unit:ci`). Entrées fabriquées, y compris hostiles.
import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {buildComment, cell, collapse, parseArgs, parseJunit, unescapeXml} from './e2e-comment.mjs'

const args = parseArgs(['--repo', 'numerique-gouv/ami-notifications-api', '--pr', '42', '--expect', 'webapp,android'])
const xmlCase = (name, extra = '', props = {}, time = '1.5') =>
  `<testcase classname="a.test.ts" name="${name}" time="${time}"><properties>${Object.entries({platform: 'webapp', ...props}).map(([k, v]) => `<property name="${k}" value="${v}"/>`).join('')}</properties>${extra}</testcase>`
const wrap = body => `<testsuites><testsuite name="a.test.ts">${body}</testsuite></testsuites>`

describe('cell : texte hostile rendu inerte', () => {
  const hostile = 'a|b `c` <img src=x onerror=1> @octocat @org/team https://evil.example/x www.evil.example [x](https://evil) **b** _i_ # h\n\n| --- |'
  const out = cell(hostile, 1000).replace(/&#\d+;/g, '')
  it('ne laisse aucun caractère actif de Markdown ou de HTML', () => {
    for (const ch of ['|', '`', '<', '>', '@', '[', ']', '*', '_', '#', '\n']) assert.ok(!out.includes(ch), `contient ${JSON.stringify(ch)} : ${out}`)
    assert.ok(!cell(hostile, 1000).includes('://') && !/www\./i.test(cell(hostile, 1000)))
    assert.ok(cell(hostile, 1000).includes('&#124;'))
  })
  it('tronque', () => assert.ok(cell('x'.repeat(5000), 50).length <= 60))
})

describe('buildComment', () => {
  it('marqueur en tête, échecs avant les passants, lien Sentry valide seulement', () => {
    const xml = wrap([
      xmlCase('passe', '', {outcome: 'passed'}),
      xmlCase('casse', '<failure message="boom"/>', {outcome: 'failed', sentry_url: 'https://sentry.incubateur.net/organizations/betagouv/explore/traces/trace/abc/?environment=Staging-new', context_kind: 'web', dump_path: 'x'}),
      xmlCase('faux lien', '<failure message="x"/>', {outcome: 'failed', sentry_url: 'https://evil.example/phish'}),
      xmlCase('natif', '<failure message="x"/>', {outcome: 'failed', context_kind: 'native', dump_path: 'y'}),
    ].join(''))
    const md = buildComment(args, parseJunit(xml, 'results-2026-10-26T10-00-00-000Z_webapp_a.xml'))
    assert.ok(md.startsWith('<!-- e2e-report:numerique-gouv/ami-notifications-api:pr-42 -->'))
    assert.ok(md.indexOf('casse') < md.indexOf('passe'))
    assert.match(md, /\[trace Sentry\]\(https:\/\/sentry\.incubateur\.net\/organizations\/betagouv\/explore\/traces\/trace\/abc\/\?environment=Staging-new\)/)
    assert.ok(!md.includes('evil.example'))
    assert.match(md, /lien Sentry refusé/)
    assert.match(md, /écran natif, pas de trace web/)
    assert.match(md, /### android — aucun résultat/)
  })
  it('un test réussi à la relance est instable (dernier essai) et garde le lien du premier échec', () => {
    const xml = wrap(xmlCase('t', '<failure message="m"/>', {outcome: 'failed', sentry_url: 'https://sentry.incubateur.net/o/1/', attempt: '1'}) + xmlCase('t', '', {outcome: 'flaky', attempt: '2'}))
    const tests = collapse(parseJunit(xml, 'results-2026-10-26T10-00-00-000Z_webapp_a.xml'))
    assert.equal(tests.length, 1)
    assert.equal(tests[0].outcome, 'flaky')
    assert.match(buildComment(args, parseJunit(xml, 'results-2026-10-26T10-00-00-000Z_webapp_a.xml')), /1 instables/)
  })
  it('reste sous la limite GitHub avec des milliers de tests et résume les lignes omises', () => {
    const body = Array.from({length: 3000}, (_, i) => xmlCase(`test numéro ${i} ${'x'.repeat(200)}`, i % 3 === 0 ? `<failure message="${'e'.repeat(500)}"/>` : '', {outcome: i % 3 === 0 ? 'failed' : 'passed'})).join('')
    const md = buildComment({...args, maxChars: 60000}, parseJunit(wrap(body), 'results-2026-10-26T10-00-00-000Z_webapp_a.xml'))
    assert.ok(md.length < 65536, String(md.length))
    assert.match(md, /non détaillée/)
    assert.ok(md.indexOf('Échec') < md.indexOf('Passant') || !md.includes('Passant'))
  })
  it('noms hostiles issus du XML (entités) restent inertes', () => {
    const name = unescapeXml('x &lt;script&gt;alert(1)&lt;/script&gt; &#64;team &#124; `y`')
    assert.ok(!cell(name).includes('<script>'))
    const md = buildComment(args, parseJunit(wrap(xmlCase('x &lt;script&gt; @team | `y`', '', {outcome: 'passed'})), 'results-2026-10-26T10-00-00-000Z_webapp_a.xml'))
    assert.ok(!md.includes('<script>') && !md.includes('@team') && !/\| `y`/.test(md))
  })
  it('refuse un --repo ou --pr invalide (pas d’injection dans le marqueur)', () => {
    assert.throws(() => parseArgs(['--repo', 'a/b -->', '--pr', '1']))
    assert.throws(() => parseArgs(['--repo', 'a/b', '--pr', '1; rm']))
  })
  it('sans résultat : message explicite', () => assert.match(buildComment(args, []), /Aucun résultat de test trouvé/))
})
