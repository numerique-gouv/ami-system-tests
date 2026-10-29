import fs from 'fs'
import path from 'path'

/**
 * Ajoute à chaque `<testcase>` du JUnit d'un run des `<property>` lisibles par `.github/scripts/e2e-comment.mjs` :
 * plateforme, AMI_ENV, issue (`passed`, `failed`, `skipped`, `flaky` pour un essai réussi après un échec), essais, et pour un échec le dump (chemin, contexte, lien Sentry).
 * Le dump est joint par titre : `normalizeTitle()` applique au titre du dump la même transformation que `suiteNameFormat` (wdio.base.conf.ts) au testcase.
 */

const TITLE_SEPARATORS = /[^\p{L}\p{N}@]+/u

export function normalizeTitle(title: string): string {
  return title.split(TITLE_SEPARATORS).filter(part => part.length > 0).join(' ')
}

export interface DumpInfo {
  title: string
  normalizedTitle: string
  suite: string | null
  failedAtUtc: string
  platform: string | null
  contextKind: string | null
  sentryUrl: string | null
  dumpPath: string
  errorMessage: string | null
}

/** Lit les `context.json` de `<runDir>/failures/*` ; un dump illisible est ignoré pour que le rapport sorte. */
export function readDumps(runDir: string, rootDir: string): DumpInfo[] {
  const failuresDir = path.join(runDir, 'failures')
  if (!fs.existsSync(failuresDir)) return []
  const dumps: DumpInfo[] = []
  for (const name of fs.readdirSync(failuresDir)) {
    const dir = path.join(failuresDir, name)
    try {
      const context = JSON.parse(fs.readFileSync(path.join(dir, 'context.json'), 'utf8')) as Record<string, unknown>
      const title = typeof context.test === 'string' ? context.test : ''
      if (!title) continue
      const sentry = context.sentry as {url?: unknown} | null | undefined
      const error = context.error as {message?: unknown} | null | undefined
      dumps.push({
        title,
        normalizedTitle: normalizeTitle(title),
        suite: typeof context.suite === 'string' ? context.suite : null,
        failedAtUtc: typeof context.failedAtUtc === 'string' ? context.failedAtUtc : '',
        platform: typeof context.platform === 'string' ? context.platform : null,
        contextKind: typeof context.contextKind === 'string' ? context.contextKind : null,
        sentryUrl: typeof sentry?.url === 'string' ? sentry.url : null,
        dumpPath: path.relative(rootDir, dir).split(path.sep).join('/'),
        errorMessage: typeof error?.message === 'string' ? error.message : null,
      })
    } catch {
    }
  }
  return dumps.sort((a, b) => a.failedAtUtc.localeCompare(b.failedAtUtc))
}

export type Outcome = 'passed' | 'failed' | 'skipped' | 'flaky'

export function caseOutcome(testcaseXml: string): Exclude<Outcome, 'flaky'> {
  if (/<(failure|error)\b/.test(testcaseXml)) return 'failed'
  if (/<skipped\b/.test(testcaseXml)) return 'skipped'
  return 'passed'
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, ' ')
}

function unescapeAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
}

export function platformOfRun(runName: string): string | null {
  return runName.match(/Z_(android|ios|webapp)_/)?.[1] ?? null
}

export interface EnrichOptions {
  runName: string
  dumps: DumpInfo[]
  amiEnv?: string | null
}

interface CaseRef {
  spec: string
  name: string
  start: number
  end: number
  xml: string
  outcome: Exclude<Outcome, 'flaky'>
}

/** Idempotent : un testcase qui a déjà un bloc `<properties>` est laissé tel quel. */
export function enrichRunXml(xml: string, options: EnrichOptions): string {
  const platform = platformOfRun(options.runName)
  const refs: CaseRef[] = []
  for (const suite of xml.matchAll(/<testsuite ([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const spec = unescapeAttr(suite[1].match(/\bname="([^"]*)"/)?.[1] ?? '')
    const bodyStart = (suite.index ?? 0) + suite[0].indexOf('>') + 1
    for (const c of suite[2].matchAll(/<testcase\b[^>]*?\/>|<testcase\b[\s\S]*?<\/testcase>/g)) {
      const start = bodyStart + (c.index ?? 0)
      const name = unescapeAttr(c[0].match(/<testcase\b[^>]*?\bname="([^"]*)"/)?.[1] ?? '')
      refs.push({spec, name, start, end: start + c[0].length, xml: c[0], outcome: caseOutcome(c[0])})
    }
  }

  const groups = new Map<string, CaseRef[]>()
  for (const ref of refs) {
    const key = `${ref.spec}\u0000${normalizeTitle(ref.name)}`
    groups.set(key, [...(groups.get(key) ?? []), ref])
  }
  const usedDumps = new Set<DumpInfo>()
  const extra = new Map<CaseRef, string[][]>()
  for (const attempts of groups.values()) {
    const failedBefore = (i: number): boolean => attempts.slice(0, i).some(a => a.outcome === 'failed')
    attempts.forEach((ref, i) => {
      const props: string[][] = []
      if (platform) props.push(['platform', platform])
      if (options.amiEnv) props.push(['ami_env', options.amiEnv])
      const outcome: Outcome = ref.outcome === 'passed' && failedBefore(i) ? 'flaky' : ref.outcome
      props.push(['outcome', outcome])
      if (attempts.length > 1) props.push(['attempt', String(i + 1)], ['attempts', String(attempts.length)])
      if (ref.outcome === 'failed') {
        const candidates = options.dumps.filter(d => d.normalizedTitle === normalizeTitle(ref.name) && !usedDumps.has(d))
        const dump = candidates[0]
        if (dump) {
          usedDumps.add(dump)
          props.push(['dump_path', dump.dumpPath])
          if (dump.contextKind) props.push(['context_kind', dump.contextKind])
          if (dump.sentryUrl) props.push(['sentry_url', dump.sentryUrl])
        }
      }
      extra.set(ref, props)
    })
  }

  let out = ''
  let cursor = 0
  for (const ref of refs) {
    out += xml.slice(cursor, ref.start)
    cursor = ref.end
    const props = extra.get(ref) ?? []
    if (/<properties>/.test(ref.xml) || props.length === 0) {
      out += ref.xml
      continue
    }
    const block = `<properties>${props.map(([k, v]) => `<property name="${k}" value="${escapeAttr(v)}"/>`).join('')}</properties>`
    out += ref.xml.endsWith('/>') && !ref.xml.includes('</testcase>')
      ? ref.xml.replace(/\/>$/, `>${block}</testcase>`)
      : ref.xml.replace(/(<testcase\b[^>]*>)/, `$1${block}`)
  }
  return out + xml.slice(cursor)
}
