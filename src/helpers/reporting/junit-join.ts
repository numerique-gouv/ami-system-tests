import fs from 'fs'
import path from 'path'

/**
 * Jointure entre le rapport JUnit d'un run et les dumps d'échec du MÊME run (`<run>/failures/<test>__<horodatage>/context.json`, écrits par
 * failure-dump.ts), pour ajouter à chaque `<testcase>` des `<property>` lisibles par un outil de rapport (script `.github/scripts/e2e-comment.mjs`) :
 *
 * - `platform` (android, ios, webapp), `ami_env` (valeur d'AMI_ENV : staging, preprod, numéro de PR), `outcome` ;
 * - pour un échec relié à un dump : `dump_path` (relatif au dossier `test-results/`), `context_kind` (web ou native), et `sentry_url` pour un
 *   contexte web dont la SPA a donné un identifiant de trace ;
 * - `attempt` et `attempts` quand un même test apparaît plusieurs fois (relance par `specFileRetries`).
 *
 * `outcome` : `passed`, `failed`, `skipped`, ou `flaky` pour le dernier essai réussi d'un test dont un essai précédent a échoué (« instable »).
 * Un test échoué à tous ses essais garde `failed` à chacun.
 *
 * Jointure par TITRE : le reporter JUnit nomme le testcase d'après le titre du `it` assaini par `suiteNameFormat` (tout bloc de caractères
 * hors lettres, chiffres et `@` devient un espace, cf. wdio.base.conf.ts) ; le dump contient le titre brut. `normalizeTitle()` applique aux deux
 * la MÊME transformation. Plusieurs dumps pour un titre (relances) sont attribués dans l'ordre chronologique aux essais échoués.
 */

/** Même assainissement que `_prepareName` de @wdio/junit-reporter avec `suiteNameFormat: /[^\p{L}\p{N}@]+/u` (cf. wdio.base.conf.ts). */
export const TITLE_SEPARATORS = /[^\p{L}\p{N}@]+/u

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
  /** Chemin du dossier du dump, relatif à `rootDir`, séparateurs `/`. */
  dumpPath: string
  errorMessage: string | null
}

/** Lit les `context.json` de `<runDir>/failures/*`. Un dump illisible est ignoré (jamais d'exception : le rapport doit sortir). */
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
      // dump absent ou JSON tronqué : pas de propriété pour ce test
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

/** Plateforme déduite du nom du run (`<horodatage>_<plateforme>_<suite ou spec>`), ou `null`. */
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

/**
 * Ajoute les `<properties>` à chaque `<testcase>` du JUnit fusionné d'un run (résultat de `mergeRunReports`). Idempotent : un testcase qui a
 * déjà un bloc `<properties>` est laissé tel quel. Renvoie le XML enrichi (inchangé s'il n'y a aucun testcase).
 */
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

  // Essais d'un même test (même spec, même titre assaini) dans l'ordre du fichier.
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
