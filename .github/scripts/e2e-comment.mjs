#!/usr/bin/env node
// POURQUOI CE SCRIPT, alors que mikepenz/action-junit-report fait déjà le check : il affiche proprement le rapport JUnit en tableau, avec le lien
// Sentry de chaque échec. Ce n'est pas notre cœur de métier. On le garde tant qu'il est stable et qu'une IA peut le maintenir ; sinon on s'en
// tient à ce que proposent les actions du marché (mikepenz/action-junit-report, déjà utilisée pour le check) et on le supprime avec son action
// (.github/actions/e2e-pr-comment) et son test.
// Commentaire de PR « tests E2E » à partir des JUnit enrichis par src/helpers/reporting/junit-join.ts. Aucune dépendance externe.
//
//   node e2e-comment.mjs --junit-dir <dossier> [--junit-dir …] --repo owner/nom --pr 123 --out comment.md
//        [--run-url URL] [--artifacts "nom1,nom2"] [--expect webapp,android] [--sha abcdef0] [--max-chars 60000]
//
// Le premier octet du fichier produit est le marqueur `<!-- e2e-report:<repo>:pr-<N> -->` (clé de mise à jour du commentaire unique).
//
// CONTRAINTE : ce script s'exécute avec un jeton `pull-requests: write` depuis la ref `checkout_ref` d'ami-system-tests (job `report` de
// workflow-e2e-main.yml). Cette ref doit rester une branche de confiance (ami-system-tests, écriture réservée à l'équipe), jamais un code de fork.
//
// SÉCURITÉ : les noms de tests et messages d'erreur viennent d'un code modifiable dans une PR. Tout texte issu des JUnit passe par `cell()`
// (échappement en entités HTML numériques de tout ce que Markdown ou GitHub interprète : | ` < > & @ [ ] * _ # ~ \ , retours à la ligne
// supprimés, `://` et `www.` neutralisés contre l'auto-lien, longueur bornée). Seuls les liens Sentry de https://sentry.incubateur.net/ au jeu de
// caractères strict deviennent des liens ; tout autre lien est affiché comme refusé.
import fs from 'node:fs'
import path from 'node:path'

const GITHUB_LIMIT = 65536
const SENTRY_HOST_PREFIX = 'https://sentry.incubateur.net/'
const PLATFORM_ORDER = ['webapp', 'android', 'ios']

// ───── entrée ─────

export function parseArgs(argv) {
  const args = {junitDirs: [], maxChars: 60000}
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2)
    const value = inline ?? argv[++i]
    switch (flag) {
      case '--junit-dir': args.junitDirs.push(value); break
      case '--repo': args.repo = value; break
      case '--pr': args.pr = value; break
      case '--out': args.out = value; break
      case '--run-url': args.runUrl = value; break
      case '--artifacts': args.artifacts = value; break
      case '--expect': args.expect = value; break
      case '--sha': args.sha = value; break
      case '--label': args.label = value; break
      case '--max-chars': args.maxChars = Math.min(Number(value) || 60000, GITHUB_LIMIT - 1000); break
      default: throw new Error(`argument inconnu : ${flag}`)
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(args.repo ?? '')) throw new Error('--repo doit valoir owner/nom')
  if (!/^[1-9]\d{0,8}$/.test(args.pr ?? '')) throw new Error('--pr doit être un numéro de PR')
  if (args.label && !/^[A-Za-z0-9_-]{1,30}$/.test(args.label)) throw new Error('--label : lettres, chiffres, - et _ seulement')
  return args
}

// ───── lecture JUnit (regex : la forme du XML est celle produite par junit-clean.ts) ─────

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}
export function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function attr(attributes, name) {
  const m = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return m ? unescapeXml(m[1]) : ''
}

function findXml(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findXml(full))
    else if (entry.isFile() && /^results-.*\.xml$/.test(entry.name)) out.push(full)
  }
  return out.sort()
}

/** Un testcase par essai. */
export function parseJunit(xml, fileName) {
  const platformFromFile = fileName.match(/Z_(android|ios|webapp)_/)?.[1] ?? 'inconnu'
  const cases = []
  for (const suite of xml.matchAll(/<testsuite ([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const spec = attr(suite[1], 'name')
    for (const c of suite[2].matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const body = c[2] ?? ''
      const props = {}
      for (const p of body.matchAll(/<property name="([^"]*)" value="([^"]*)"\/>/g)) props[unescapeXml(p[1])] = unescapeXml(p[2])
      const failure = body.match(/<(?:failure|error)\b([^>]*?)(?:\/>|>)/)
      const skipped = /<skipped\b/.test(body)
      cases.push({
        spec,
        name: attr(c[1], 'name'),
        time: Number(attr(c[1], 'time')) || 0,
        platform: props.platform ?? platformFromFile,
        amiEnv: props.ami_env ?? '',
        outcome: props.outcome ?? (failure ? 'failed' : skipped ? 'skipped' : 'passed'),
        message: failure ? attr(failure[1], 'message') : '',
        sentryUrl: props.sentry_url ?? '',
        contextKind: props.context_kind ?? '',
        hasDump: Boolean(props.dump_path),
        file: fileName,
      })
    }
  }
  return cases
}

/** Regroupe les essais d'un même test dans un même fichier JUnit (= un run : plateforme + spec + nom) : le DERNIER essai fait foi, `flaky` est déjà posé par junit-join. */
export function collapse(cases) {
  const byKey = new Map()
  for (const c of cases) {
    const key = [c.file, c.platform, c.spec, c.name].join('\u0000')
    byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  return [...byKey.values()].map(attempts => {
    const last = attempts[attempts.length - 1]
    const firstFailure = attempts.find(a => a.outcome === 'failed')
    return {
      ...last,
      time: attempts.reduce((n, a) => n + a.time, 0),
      attempts: attempts.length,
      // Pour un échec comme pour un test instable : message et lien Sentry du premier essai échoué si le dernier n'en a pas.
      message: last.message || firstFailure?.message || '',
      sentryUrl: last.sentryUrl || firstFailure?.sentryUrl || '',
      contextKind: last.contextKind || firstFailure?.contextKind || '',
      hasDump: last.hasDump || Boolean(firstFailure?.hasDump),
    }
  })
}

// ───── échappement ─────

/** Texte non fiable → texte inerte dans une cellule de tableau Markdown. */
export function cell(text, max = 140) {
  let s = String(text ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length > max) s = `${s.slice(0, max - 1)}…`
  s = s.replace(/:\/\//g, ':\u200b//').replace(/\bwww\./gi, 'www\u200b.')
  return s.replace(/[&|`<>@[\]*_#~\\]/g, ch => `&#${ch.codePointAt(0)};`).replace(/\u200b/g, '&#8203;')
}

function sentryLink(url) {
  if (!url) return null
  return url.startsWith(SENTRY_HOST_PREFIX) && /^[A-Za-z0-9:/._?=&%-]+$/.test(url) && url.length < 600 ? url : false
}

// ───── Markdown ─────

const RANK = {failed: 0, flaky: 1, skipped: 2, passed: 3}
const LABEL = {failed: 'Échec', flaky: 'Instable', skipped: 'Ignoré', passed: 'Passant'}

function duration(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, '0')} s` : `${seconds.toFixed(1)} s`
}

function sentryCell(t) {
  if (t.outcome !== 'failed' && t.outcome !== 'flaky') return ''
  const link = sentryLink(t.sentryUrl)
  if (link) return `[trace Sentry](${link})`
  if (link === false) return '— (lien Sentry refusé : hôte ou caractères inattendus)'
  if (t.contextKind === 'native') return '— (écran natif, pas de trace web)'
  return t.hasDump ? '— (pas d’identifiant de trace)' : '— (pas de dump d’échec)'
}

function row(t) {
  const error = t.outcome === 'failed' || t.outcome === 'flaky' ? cell(t.message, 160) : ''
  const retry = t.attempts > 1 ? ` (${t.attempts} essais)` : ''
  return `| ${cell(t.name)}${error ? `<br>${error}` : ''} | ${LABEL[t.outcome] ?? cell(t.outcome, 20)}${retry} | ${duration(t.time)} | ${sentryCell(t)} |`
}

function counts(tests) {
  const n = key => tests.filter(t => t.outcome === key).length
  return {total: tests.length, failed: n('failed'), flaky: n('flaky'), skipped: n('skipped'), passed: n('passed')}
}

/** Section d'une plateforme ; `rowsBudget` : nombre de caractères alloué aux lignes (les passants sautent d'abord). */
function platformSection(platform, tests, rowsBudget) {
  const c = counts(tests)
  const envs = [...new Set(tests.map(t => t.amiEnv).filter(Boolean))].map(e => cell(e, 40)).join(', ')
  const head = `### ${cell(platform, 20)}${envs ? ` (AMI_ENV : ${envs})` : ''} — ${c.passed} passants, ${c.failed} en échec, ${c.skipped} ignorés, ${c.flaky} instables`
  const sorted = [...tests].sort((a, b) => (RANK[a.outcome] ?? 9) - (RANK[b.outcome] ?? 9) || a.spec.localeCompare(b.spec) || a.name.localeCompare(b.name))
  const lines = []
  let used = 0
  let omitted = 0
  for (const t of sorted) {
    const line = row(t)
    if (used + line.length + 1 > rowsBudget) { omitted++; continue }
    lines.push(line)
    used += line.length + 1
  }
  const table = lines.length > 0 ? ['| Test | Résultat | Durée | Sentry |', '|---|---|---|---|', ...lines].join('\n') : ''
  const note = omitted > 0 ? `\n\n_${omitted} ligne(s) non détaillée(s) (taille limitée du commentaire) : voir l’artefact du run._` : ''
  return [head, '', table, note].join('\n').trimEnd()
}

export function buildComment(args, allCases) {
  const marker = `<!-- e2e-report:${args.repo}:pr-${args.pr}${args.label ? `:${args.label}` : ''} -->`
  const tests = collapse(allCases)
  const byPlatform = new Map()
  for (const t of tests) byPlatform.set(t.platform, [...(byPlatform.get(t.platform) ?? []), t])
  const expected = (args.expect ?? '').split(',').map(s => s.trim()).filter(s => PLATFORM_ORDER.includes(s))
  const platforms = [...new Set([...expected, ...byPlatform.keys()])].sort((a, b) => (PLATFORM_ORDER.indexOf(a) + 1 || 9) - (PLATFORM_ORDER.indexOf(b) + 1 || 9))

  const links = []
  if (args.runUrl) {
    if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(\/attempts\/\d+)?$/.test(args.runUrl)) links.push(`[Run GitHub Actions et artefacts](${args.runUrl})`)
    else links.push('Lien du run refusé (URL inattendue)')
  }
  const artifacts = (args.artifacts ?? '').split(',').map(s => s.trim()).filter(Boolean).map(a => `\`${a.replace(/[^\w.-]/g, '_')}\``)
  if (artifacts.length) links.push(`Artefacts : ${artifacts.join(', ')}`)
  if (args.sha) links.push(`Commit \`${args.sha.replace(/[^0-9a-f]/gi, '').slice(0, 12)}\``)

  const total = counts(tests)
  const header = [
    marker,
    `## Tests E2E — \`${args.repo}\` PR #${args.pr}${args.label ? ` (${args.label})` : ''}`,
    '',
    tests.length > 0
      ? `**${total.passed} passants, ${total.failed} en échec, ${total.skipped} ignorés, ${total.flaky} instables** sur ${total.total} tests.`
      : '**Aucun résultat de test trouvé** (le job a peut-être échoué avant les tests : voir le run).',
    '',
    links.join(' · '),
  ].join('\n')
  const footer = '\n\n_Commentaire mis à jour à chaque run. « Instable » = échoué puis passé à la relance du fichier de spec._'

  const missing = platforms.filter(p => !byPlatform.has(p)).map(p => `### ${cell(p, 20)} — aucun résultat (non lancé, ou échec avant les tests)`)
  const budget = args.maxChars - header.length - footer.length - missing.join('\n\n').length - 200
  const perPlatform = Math.max(2000, Math.floor(budget / Math.max(1, byPlatform.size)) - 300)
  const sections = platforms.filter(p => byPlatform.has(p)).map(p => platformSection(p, byPlatform.get(p), perPlatform))
  let body = [header, ...sections, ...missing].join('\n\n') + footer
  if (body.length > args.maxChars) body = `${body.slice(0, args.maxChars - 200)}\n\n_Commentaire tronqué (limite GitHub)._`
  return body
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = args.junitDirs.flatMap(findXml)
  const cases = files.flatMap(f => parseJunit(fs.readFileSync(f, 'utf8'), path.basename(f)))
  const md = buildComment(args, cases)
  if (md.length >= GITHUB_LIMIT) throw new Error(`commentaire trop long : ${md.length}`)
  if (args.out) fs.writeFileSync(args.out, md)
  else process.stdout.write(md)
  console.error(`e2e-comment : ${files.length} fichier(s) JUnit, ${cases.length} testcase(s), ${md.length} caractères`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
