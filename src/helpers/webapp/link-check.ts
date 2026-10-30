/**
 * Contrôle de la cible d'un lien qui quitte la SPA (catalogue, aide, iframe). Seuls l'hôte et le chemin sont conservés dans `LinkTarget`,
 * jamais la requête ni le fragment : l'URL du catalogue Service Public porte des jetons à usage unique, qu'on ne rejoue pas depuis Node
 * et qu'on ne journalise pas. Une cible externe sans jeton peut être interceptée au clic puis contrôlée en HTTP (`deferExternal`).
 */

export interface LinkTarget {
  /** Le clic est resté dans la SPA (même origine). */
  internal: boolean
  /** Fragment sans requête de la route interne atteinte (ex. `#/procedure-17cyber`). */
  route?: string
  host: string
  path: string
  /** Statut HTTP du document, `null` si le navigateur ne le donne pas. */
  status: number | null
  title: string
  /** Début du texte visible, espaces normalisés. */
  excerpt: string
}

const NAVIGATION_TIMEOUT_MS = 20000
// Une cible injoignable (hôte de PRIVATE_NETWORK_HOSTS hors VPN) ne rend la main qu'après le délai de connexion du navigateur (~75 s).
const SETTLE_TIMEOUT_MS = 120000
const SETTLE_MS = 1500

/** La seule forme d'une cible qu'on affiche. */
export function describeTarget(target: Pick<LinkTarget, 'host' | 'path'>): string {
  return `${target.host}${target.path}`
}

/** Titre ou début de page d'erreur, volontairement étroit : « erreur » seul apparaît sur des pages valides. */
const ERROR_PAGE = /\b(404|500|502|503)\b|page (introuvable|non trouvée)|not found|n'existe pas|n’existe pas/i

/** Lien KO : statut absent ou ≥ 400, ou page d'erreur. Un 200 sur une page de connexion n'est pas cassé (voir `isLoginWall`). */
export function isBrokenTarget(target: Pick<LinkTarget, 'status' | 'title' | 'excerpt'>): boolean {
  if (target.status === null || target.status >= 400) return true
  return ERROR_PAGE.test(target.title) || ERROR_PAGE.test(target.excerpt.slice(0, 200))
}

/** Hôtes de préproduction partenaires, joignables seulement depuis un réseau privé : leur absence de réponse est tolérée (décision de l'équipe). */
export const PRIVATE_NETWORK_HOSTS: ReadonlySet<string> = new Set([
  'www.masecurite-form.pp.gendarmerie.interieur.gouv.fr',
  'qualif.demarches.service-public.gouv.fr',
])

/** Hôte de réseau privé qui ne répond pas du tout : une réponse HTTP, même 404, reste un lien cassé. */
export function isExpectedUnreachable(target: Pick<LinkTarget, 'host' | 'status'>): boolean {
  return target.status === null && PRIVATE_NETWORK_HOSTS.has(target.host)
}

export function toleratedUnreachableWarning(line: string): string {
  return `ANOMALIE tolérée (hôte joignable seulement depuis un réseau privé) : ${line}`
}

/** Certains titres de démarche contiennent des entités littérales (`&#39;` pour l'apostrophe). */
function decodeNumericEntities(text: string): string {
  return text.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

function normalizeForComparison(text: string): string {
  return decodeNumericEntities(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mots finaux du libellé supposés être le nom du service accolé au nom de la démarche. */
const MAX_SERVICE_WORDS = 8
const MIN_NAME_WORDS = 2

/**
 * Le titre de la page cible mentionne-t-il le nom de la carte ? Règle provisoire, jamais bloquante. Le libellé de la carte accole le nom du
 * service à celui de la démarche : on accepte le libellé amputé de 0 à `MAX_SERVICE_WORDS` mots finaux, tant qu'il en reste `MIN_NAME_WORDS`.
 * TODO : isoler le nom par la structure du DOM de la carte.
 */
export function titleMentionsCard(title: string, cardLabel: string): boolean {
  const words = normalizeForComparison(cardLabel).split(' ').filter(Boolean)
  const normalizedTitle = ` ${normalizeForComparison(title)} `
  for (let drop = 0; drop <= MAX_SERVICE_WORDS; drop++) {
    const kept = words.length - drop
    if (kept < MIN_NAME_WORDS && !(drop === 0 && kept >= 1)) break
    if (normalizedTitle.includes(` ${words.slice(0, kept).join(' ')} `)) return true
  }
  return false
}

export function isInternalErrorRoute(target: Pick<LinkTarget, 'route'>): boolean {
  return /^#\/(technical-error|network-error|forbidden)\b/.test(target.route ?? '')
}

/** Formulaire de connexion : statut 200 mais service inutilisable sans compte. */
export function isLoginWall(target: Pick<LinkTarget, 'title'>): boolean {
  return /^se connecter\b/i.test(target.title)
}

/** Cible externe dont le clic a été interceptée avant le chargement : seule son adresse, à contrôler par `describeByHttp`, jamais affichée (elle peut porter une requête). */
export interface DeferredLink {
  deferred: true
  url: string
}

export function isDeferred(target: LinkTarget | DeferredLink): target is DeferredLink {
  return 'deferred' in target
}

/** Paramètres d'adresse portant un jeton à usage unique : une telle cible n'est jamais interceptée. */
const SECRET_PARAMS = '^(caller|code|state|nonce|signature|sig)$|token|login_redirect'

/**
 * Intercepte la prochaine navigation de document vers une autre origine (événement `navigate`) : l'adresse est mémorisée et la navigation
 * annulée. Rien n'est intercepté pour une cible de la SPA, une adresse à jeton ou un événement non annulable : le clic suit son cours.
 */
async function armNavigationCapture(): Promise<void> {
  await browser.execute((secretParams: string) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const navigation = w.navigation
    if (!navigation) return
    if (w.__amiNavigationHandler) navigation.removeEventListener('navigate', w.__amiNavigationHandler)
    w.__amiNavigationTarget = null
    const secret = new RegExp(secretParams, 'i')
    w.__amiNavigationHandler = (event: any): void => {
      if (!event.cancelable || event.hashChange || event.downloadRequest !== null) return
      const destination = new URL(event.destination.url)
      if (!/^https?:$/.test(destination.protocol) || destination.origin === location.origin) return
      if ([...destination.searchParams.keys()].some(key => secret.test(key))) return
      w.__amiNavigationTarget = destination.href
      event.preventDefault()
    }
    navigation.addEventListener('navigate', w.__amiNavigationHandler)
  }, SECRET_PARAMS)
}

/** `DeferredLink` si la navigation a été interceptée, `null` si elle suit son cours. */
async function capturedNavigation(before: string): Promise<DeferredLink | null> {
  let url: string | null = null
  try {
    await browser.waitUntil(async () => {
      url = await browser.execute(() => (window as unknown as {__amiNavigationTarget?: string | null}).__amiNavigationTarget ?? null)
        .catch(() => null)
      return url !== null || (await browser.getUrl()) !== before
    }, {timeout: NAVIGATION_TIMEOUT_MS, interval: 100})
  } catch { /* délai écoulé : pas interceptée, `followAndDescribe` en rend compte */ }
  return url ? {deferred: true, url} : null
}

/**
 * Exécute `click`, attend que l'URL change puis se stabilise (les redirections OIDC en enchaînent plusieurs), et décrit la page atteinte.
 * Une cible qui ne répond pas est un résultat et non une erreur : Chrome affiche sa page d'erreur après ~75 s, la cible est alors décrite
 * avec l'hôte et le chemin visés, un statut `null` et le texte de l'erreur du navigateur.
 */
export async function followAndDescribe(click: () => Promise<void>): Promise<LinkTarget>
export async function followAndDescribe(click: () => Promise<void>, options: {deferExternal: true}): Promise<LinkTarget | DeferredLink>
export async function followAndDescribe(click: () => Promise<void>, options?: {deferExternal: true}): Promise<LinkTarget | DeferredLink> {
  const before = await browser.getUrl()
  const origin = new URL(before).origin
  if (options?.deferExternal) await armNavigationCapture()
  await click()
  if (options?.deferExternal) {
    const deferred = await capturedNavigation(before)
    if (deferred) return deferred
  }

  let changed = before
  await browser.waitUntil(async () => {
    changed = await browser.getUrl()
    return changed !== before
  }, {
    timeout: NAVIGATION_TIMEOUT_MS, interval: 200,
    timeoutMsg: `Le clic n'a pas changé l'adresse après ${NAVIGATION_TIMEOUT_MS}ms (restée sur ${describeTarget(parts(before))})`,
  })

  // Stable : même adresse sur deux lectures espacées de SETTLE_MS, document chargé.
  let last = ''
  let lastReal = changed // dernière adresse qui n'est pas une page d'erreur du navigateur
  let settled = true
  try {
    await browser.waitUntil(async () => {
      const url = await browser.getUrl()
      if (!url.startsWith('chrome-error:')) lastReal = url
      // `interactive` suffit : attendre `complete` bloque sur les ressources tierces lentes.
      const ready = await browser.execute(() => document.readyState !== 'loading')
      // Interstitielle de redirection d'AMI : la cible n'est pas encore atteinte, même si l'adresse ne bouge plus.
      const redirecting = !url.startsWith('chrome-error:') && new URL(url).origin === origin && new URL(url).searchParams.has('login_redirect_url')
      const stable = ready && !redirecting && url === last
      last = url
      return stable
    }, {timeout: SETTLE_TIMEOUT_MS, interval: SETTLE_MS})
  } catch {
    settled = false
  }

  if (!settled) {
    return {internal: false, ...intendedTarget(lastReal), status: null, title: 'La page ne répond pas', excerpt: ''}
  }

  const page = await browser.execute(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      origin: location.origin, host: location.host, path: location.pathname, hash: location.hash.split('?')[0],
      status: nav && nav.responseStatus ? nav.responseStatus : null,
      title: document.title,
      excerpt: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 300),
    }
  })
  const browserError = last.startsWith('chrome-error:') || page.host === 'chromewebdata'
  const target: LinkTarget = browserError
    ? {internal: false, ...intendedTarget(lastReal), status: null, title: 'Page d’erreur du navigateur', excerpt: page.excerpt}
    : {internal: page.origin === origin, route: page.origin === origin ? page.hash : undefined, host: page.host, path: page.path, status: page.status, title: page.title, excerpt: page.excerpt}
  return target
}

/** Hôte et chemin visés : ceux de `login_redirect_url` si AMI redirige d'abord par lui, sinon ceux de l'adresse. Nomme une cible qui ne répond pas. */
function intendedTarget(url: string): {host: string; path: string} {
  const u = new URL(url)
  const redirect = u.searchParams.get('login_redirect_url')
  if (redirect) {
    try {
      const r = new URL(redirect)
      return {host: r.host, path: r.pathname}
    } catch { /* adresse de redirection illisible : on garde celle d'AMI */ }
  }
  return {host: u.host, path: u.pathname}
}

function parts(url: string): {host: string; path: string} {
  const u = new URL(url)
  return {host: u.host, path: u.pathname}
}

/**
 * Statut HTTP d'une adresse sans jeton, lue depuis Node ; `null` si pas de réponse. `referer` : le widget cybermalveillance (WAF) répond 403
 * sans le `Referer` d'AMI et 200 avec.
 */
export async function statusOf(url: string, referer?: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15000),
      headers: referer ? {Referer: referer} : undefined,
    })
    return response.status
  } catch {
    return null
  }
}

// Sans User-Agent de navigateur, certains sites répondent 403 aux scripts.
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const HTTP_TIMEOUT_MS = 15000
/** Le titre et le début du texte visible suffisent : inutile de lire la page entière. */
const BODY_LIMIT_BYTES = 65536

/** Texte visible approximatif d'un document HTML. */
function visibleText(html: string): string {
  return decodeNumericEntities(html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    .replace(/\s+/g, ' ').trim()
}

/**
 * Décrit une cible interceptée par une requête HTTP depuis Node plutôt que dans le navigateur : même `LinkTarget`, donc même classification.
 * Sans réponse (réseau, délai, TLS) : statut `null`. Aucun JavaScript n'est exécuté : un titre posé côté client n'est pas vu.
 */
export async function describeByHttp(link: DeferredLink): Promise<LinkTarget> {
  const asked = parts(link.url)
  try {
    const response = await fetch(link.url, {
      redirect: 'follow', signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: {'User-Agent': BROWSER_USER_AGENT, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9'},
    })
    const html = await readStart(response)
    const title = visibleText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
    const target: LinkTarget = {internal: false, ...parts(response.url || link.url), status: response.status, title, excerpt: visibleText(html).slice(0, 300)}
    return target
  } catch {
    return {internal: false, ...asked, status: null, title: 'La page ne répond pas', excerpt: ''}
  }
}

async function readStart(response: Response): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  while (bytes < BODY_LIMIT_BYTES) {
    const {done, value} = await reader.read()
    if (done) break
    bytes += value.byteLength
    text += decoder.decode(value, {stream: true})
  }
  await reader.cancel().catch(() => undefined)
  return text
}

const HTTP_CONCURRENCY = 6

/** Contrôle HTTP des cibles interceptées, `HTTP_CONCURRENCY` requêtes au plus à la fois, dans l'ordre de `deferred`. */
export async function describeDeferred(deferred: readonly {link: DeferredLink}[]): Promise<LinkTarget[]> {
  return await mapWithConcurrency(deferred, HTTP_CONCURRENCY, async ({link}) => await describeByHttp(link))
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }))
  return results
}
