import logger from '@wdio/logger'

/**
 * Contrôle de la cible d'un lien qui quitte la SPA (catalogue, aide, iframe), pour les scénarios « aucun lien KO »
 * (réunion du 2026-10-06, `src/tests/webapp/parcours/catalogue.md`).
 *
 * Exception : une cible externe SANS jeton peut être interceptée au clic et contrôlée en HTTP (`followAndDescribe` avec
 * `deferExternal`, `describeByHttp`), ce qui évite de charger des sites tiers lents dans le navigateur.
 *
 * Sinon, la cible est lue DEPUIS LE NAVIGATEUR, après le vrai clic : l'URL du catalogue Service Public porte des jetons à usage
 * unique (`caller`, `id_token`, relevé en live le 2026-10-15) qu'on ne doit ni rejouer depuis Node, ni journaliser. Seuls
 * l'hôte et le chemin sont conservés dans `LinkTarget` : jamais la requête (`?…`) ni le fragment (`#…`).
 */

const log = logger('helper')

/** Ce qu'on garde d'une page cible : aucune donnée de la requête, aucun jeton. */
export interface LinkTarget {
  /** Le clic est resté dans la SPA (même origine : route interne, ex. `#/procedure-17cyber`). */
  internal: boolean
  /** Route interne atteinte (fragment sans requête, ex. `#/procedure-17cyber`) ; absente pour une cible externe. */
  route?: string
  host: string
  path: string
  /** Statut HTTP du document (`PerformanceNavigationTiming.responseStatus`), `null` si le navigateur ne le donne pas. */
  status: number | null
  title: string
  /** Début du texte visible, espaces normalisés. */
  excerpt: string
}

const NAVIGATION_TIMEOUT_MS = 20000
// ATTENTION, LENTEUR : une cible injoignable (hôte de `PRIVATE_NETWORK_HOSTS` hors VPN) ne rend la main qu'après le délai de connexion du
// navigateur (~75 s) ; mesuré le 2026-10-28 : ni `pageLoad` (15 s) ni un `SETTLE_TIMEOUT_MS` de 20 s n'y changent rien (le spec reste à ~2 min 40).
// Les specs de `src/tests/webapp/parcours/` cumulent donc plusieurs minutes quand le VPN manque : ne pas les lancer en session de travail.
// Hack disponible si l'attente devient pénible (non retenu : un argument Chrome peu lisible) : dans `wdio.webapp.conf.ts`, ajouter aux `args` de
// `goog:chromeOptions` un argument `--host-resolver-rules=MAP <hôte> ~NOTFOUND` par hôte de `PRIVATE_NETWORK_HOSTS` (liste séparée par des
// virgules). La résolution de ces hôtes échoue alors tout de suite (page d'erreur du navigateur, statut null, même constat) : mesuré le
// 2026-10-28 sur `demarche-detail.parcours`, 2 min 23 → 1 min 03. Effet de bord : ces hôtes ne sont plus joints, même depuis un VPN.
const SETTLE_TIMEOUT_MS = 120000
const SETTLE_MS = 1500

/** `host + path` : la seule forme d'une cible qu'on affiche ou journalise. */
export function describeTarget(target: Pick<LinkTarget, 'host' | 'path'>): string {
  return `${target.host}${target.path}`
}

/**
 * Titre ou début de page d'une page d'erreur. Volontairement étroit (le mot « erreur » seul apparaît sur des pages valides).
 * À AFFINER avec l'équipe : la réunion n'a pas défini ce qu'est un lien KO au-delà de la 404 (cf. catalogue.md).
 */
const ERROR_PAGE = /\b(404|500|502|503)\b|page (introuvable|non trouvée)|not found|n'existe pas|n’existe pas/i

/**
 * Une cible est-elle cassée ? C'est la définition métier de « lien KO » : statut absent ou ≥ 400, ou titre / début de page d'une
 * page d'erreur. Un 200 sur une page de connexion n'est PAS cassé ici (voir `isLoginWall`, signalé à part).
 */
export function isBrokenTarget(target: Pick<LinkTarget, 'status' | 'title' | 'excerpt'>): boolean {
  if (target.status === null || target.status >= 400) return true
  return ERROR_PAGE.test(target.title) || ERROR_PAGE.test(target.excerpt.slice(0, 200))
}

/**
 * Hôtes de PRÉPRODUCTION de partenaires qui ne sont joignables que depuis un réseau privé : depuis une machine publique la
 * connexion expire (`ERR_CONNECTION_TIMED_OUT`, relevé le 2026-10-15 sur l'entrée « Dialoguer avec la police ou la gendarmerie »).
 * Décision de l'équipe (2026-10-15) : leur échec est journalisé en avertissement, il ne fait pas échouer le test.
 * À maintenir à la main : n'ajouter un hôte qu'après confirmation qu'il est volontairement privé.
 */
export const PRIVATE_NETWORK_HOSTS: ReadonlySet<string> = new Set([
  'www.masecurite-form.pp.gendarmerie.interieur.gouv.fr',
  // Service Public « qualif » : cible des cartes Service Public du catalogue de STAGING (relevé le 2026-10-15, aucune réponse depuis une
  // machine publique). Ajouté sur décision de l'équipe, même règle que la gendarmerie.
  'qualif.demarches.service-public.gouv.fr',
])

/**
 * Contexte dans lequel l'injoignabilité d'une cible est acceptable. Une seule valeur aujourd'hui, celle de `PRIVATE_NETWORK_HOSTS` ;
 * un autre contexte s'ajoute avec sa propre liste d'hôtes, jamais en élargissant celle-ci.
 */
export type UnreachableContext = 'réseau privé'

/** Argument nommé de l'appelant : « cette injoignabilité est acceptable, et seulement dans ce contexte » (visible à la lecture de l'appel). */
export interface UnreachableOk {
  unreachableOk: UnreachableContext
}

const HOSTS_BY_CONTEXT: Readonly<Record<UnreachableContext, ReadonlySet<string>>> = {'réseau privé': PRIVATE_NETWORK_HOSTS}

/**
 * La cible est-elle un hôte connu pour n'être joignable que depuis un réseau privé, et ne répond-elle pas du tout ? Une réponse HTTP
 * (même 404) n'est PAS tolérée : seule l'absence de réponse l'est, donc un hôte qui répondrait en erreur reste un lien cassé.
 *
 * `options` est facultatif pour les appelants historiques (catalogue, liste d'étapes : mêmes règles qu'avant, contexte « réseau
 * privé »). Un appelant nouveau le passe (`{unreachableOk: 'réseau privé'}`) pour que le contexte soit lisible à l'appel ;
 * `toleratedUnreachableWarning` le reprend dans l'avertissement.
 */
export function isExpectedUnreachable(target: Pick<LinkTarget, 'host' | 'status'>, options: UnreachableOk = {unreachableOk: 'réseau privé'}): boolean {
  return target.status === null && HOSTS_BY_CONTEXT[options.unreachableOk].has(target.host)
}

/** Message de l'avertissement « ANOMALIE tolérée » : le même qu'ailleurs, avec le contexte de la tolérance. */
export function toleratedUnreachableWarning(line: string, options: UnreachableOk = {unreachableOk: 'réseau privé'}): string {
  return `ANOMALIE tolérée (hôte joignable seulement depuis un ${options.unreachableOk}) : ${line}`
}

/** Entités HTML numériques littérales relevées dans des titres de démarche numérique (`&#39;` à la place de l'apostrophe, 2026-10-15). */
function decodeNumericEntities(text: string): string {
  return text.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

/** Forme comparable d'un texte : entités décodées, sans diacritiques (NFD), minuscules, ponctuation remplacée par des espaces, espaces réduits. */
function normalizeForComparison(text: string): string {
  return decodeNumericEntities(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nombre maximal de mots finaux du libellé qu'on suppose être le nom du service (le plus long relevé : « Caisse nationale militaire de sécurité sociale (CNMSS) », 7 mots). */
const MAX_SERVICE_WORDS = 8
/** En deçà, un début de libellé est trop court pour être significatif. */
const MIN_NAME_WORDS = 2

/**
 * Le titre de la page cible d'une carte du catalogue mentionne-t-il le nom de la carte ? Règle PROVISOIRE de S1.5 (décision de
 * l'équipe, 2026-10-15) : contenance après normalisation (casse, accents, ponctuation, espaces, entités HTML), jamais bloquante :
 * l'appelant journalise `ANOMALIE ?`. C'est Kevin qui tranchera la vraie règle sur des données réelles (catalogue.md § S1.5).
 *
 * `cardLabel` est le texte de la carte tel que `ServicesPage.catalogueLabels()` le lit : « <nom de démarche> <service> », sans séparation
 * exploitable. Le nom de service accolé est donc ignoré par approximation : on accepte le libellé amputé de 0 à `MAX_SERVICE_WORDS`
 * mots finaux, tant qu'il reste `MIN_NAME_WORDS` mots. Calibré sur les 20 cartes de préprod du 2026-10-15 (le libellé complet ne
 * figure dans aucun titre, le service en étant absent).
 * TODO : isoler le nom par la structure du DOM de la carte (non inspecté) pour remplacer cette approximation.
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

/** Une route interne qui est une page d'erreur de la SPA (`#/technical-error`, `#/network-error`, `#/forbidden`). */
export function isInternalErrorRoute(target: Pick<LinkTarget, 'route'>): boolean {
  return /^#\/(technical-error|network-error|forbidden)\b/.test(target.route ?? '')
}

/** La cible est-elle un formulaire de connexion (statut 200 mais service inutilisable sans compte) ? */
export function isLoginWall(target: Pick<LinkTarget, 'title'>): boolean {
  return /^se connecter\b/i.test(target.title)
}

/**
 * Cible externe dont le clic a été INTERCEPTÉ avant le chargement (`armNavigationCapture`) : on n'a que son adresse, à contrôler
 * ensuite par `describeByHttp`. L'adresse n'est jamais affichée ni journalisée (`url` peut porter une requête).
 */
export interface DeferredLink {
  deferred: true
  url: string
}

/** Un `LinkTarget` (cible déjà décrite depuis le navigateur) ou un `DeferredLink` (à contrôler par `describeByHttp`). */
export function isDeferred(target: LinkTarget | DeferredLink): target is DeferredLink {
  return 'deferred' in target
}

/** Noms de paramètres d'adresse qui portent un jeton ou un état de session à usage unique : une telle cible n'est jamais interceptée. */
const SECRET_PARAMS = '^(caller|code|state|nonce|signature|sig)$|token|login_redirect'

/**
 * Prépare la page courante à intercepter la PROCHAINE navigation de document vers une autre origine (API Navigation de Chrome,
 * événement `navigate`) : l'adresse visée est mémorisée puis la navigation annulée, la cible n'est donc jamais chargée. Rien n'est
 * intercepté pour une cible de la SPA, pour une adresse portant un jeton (`SECRET_PARAMS` : l'URL des cartes Service Public est à
 * usage unique, voir l'en-tête du fichier) ni si l'événement n'est pas annulable : le clic suit alors son cours et
 * `followAndDescribe` décrit la page depuis le navigateur, comme avant.
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

/**
 * Après le clic : `DeferredLink` si la navigation a été interceptée, `null` si elle suit son cours (l'adresse a changé, ou le
 * délai de `NAVIGATION_TIMEOUT_MS` est écoulé : `followAndDescribe` produit alors son message habituel).
 */
async function capturedNavigation(before: string): Promise<DeferredLink | null> {
  let url: string | null = null
  try {
    await browser.waitUntil(async () => {
      // La page peut se décharger entre deux commandes (navigation non interceptée) : une lecture qui échoue ne dit rien.
      url = await browser.execute(() => (window as unknown as {__amiNavigationTarget?: string | null}).__amiNavigationTarget ?? null)
        .catch(() => null)
      return url !== null || (await browser.getUrl()) !== before
    }, {timeout: NAVIGATION_TIMEOUT_MS, interval: 100})
  } catch { /* délai écoulé : la navigation n'a pas été interceptée, `followAndDescribe` en rend compte */ }
  return url ? {deferred: true, url} : null
}

/**
 * Exécute `click` (qui doit déclencher la navigation), attend que l'URL change puis se stabilise (les redirections
 * OIDC enchaînent plusieurs adresses), et décrit la page atteinte.
 *
 * Une cible qui ne répond pas n'est PAS une erreur du test mais un résultat : Chrome affiche alors sa page d'erreur
 * (`chrome-error://chromewebdata`, ex. `ERR_CONNECTION_TIMED_OUT`, relevé le 2026-10-15 sur l'entrée « Dialoguer avec la police ou la
 * gendarmerie ») après un délai de connexion de l'ordre de 75 s, pendant lequel les commandes WebDriver restent bloquées : d'où
 * `SETTLE_TIMEOUT_MS`. La cible est alors décrite avec l'hôte et le chemin visés, un statut `null` (donc `isBrokenTarget` vrai) et
 * le texte de l'erreur du navigateur.
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

  // Stable : même adresse sur deux lectures espacées de SETTLE_MS, document complètement chargé.
  let last = ''
  let lastReal = changed // dernière adresse qui n'est pas une page d'erreur du navigateur : sert à nommer l'hôte visé
  let settled = true
  try {
    await browser.waitUntil(async () => {
      const url = await browser.getUrl()
      if (!url.startsWith('chrome-error:')) lastReal = url
      // `interactive` suffit (DOM prêt, statut et titre lisibles) : attendre `complete` bloquait plus d'une minute sur des pages
      // externes aux ressources tierces lentes (service-public.gouv.fr/contact, lannuaire…, relevé le 2026-10-15).
      const ready = await browser.execute(() => document.readyState !== 'loading')
      // Interstitielle de redirection d'AMI (`/?login_redirect_url=…`, même origine) : la cible n'est pas encore atteinte. Sans ce
      // garde-fou, une redirection lente était jugée « stable » sur cette page et rapportée comme « resté dans l'application »
      // (faux positif relevé le 2026-10-15 sur un lien de liste d'étapes CNMSS).
      const redirecting = !url.startsWith('chrome-error:') && new URL(url).origin === origin && new URL(url).searchParams.has('login_redirect_url')
      const stable = ready && !redirecting && url === last
      last = url
      return stable
    }, {timeout: SETTLE_TIMEOUT_MS, interval: SETTLE_MS})
  } catch (err) {
    settled = false
    log.warn(`la cible ${describeTarget(intendedTarget(lastReal))} ne s'est pas stabilisée en ${SETTLE_TIMEOUT_MS}ms : ${(err as Error).message}`)
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
  log.info(`lien suivi → ${describeTarget(target)} (statut ${target.status}, interne : ${target.internal})`)
  return target
}

/**
 * Hôte et chemin VISÉS par une adresse : celui de `login_redirect_url` si AMI redirige d'abord par lui (cas des cartes et entrées
 * qui passent par la connexion silencieuse), sinon ceux de l'adresse elle-même. Jamais la requête ni le fragment (jetons).
 * Sert à nommer une cible qui ne répond pas : le navigateur ne « valide » jamais son adresse, il garde celle d'AMI.
 */
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
 * Statut HTTP d'une adresse SANS jeton (iframe d'un widget, lien en dur), lue depuis Node. À ne pas utiliser pour les cibles du
 * catalogue Service Public (jetons à usage unique : `followAndDescribe`). `null` : pas de réponse (réseau, délai).
 * `referer` : page d'où l'adresse est réellement chargée. Le widget cybermalveillance (WAF Imperva) répond 403 sans le `Referer`
 * d'AMI et 200 avec (relevé le 2026-10-15) : sans lui, le contrôle jugerait cassé un lien qui fonctionne dans l'application.
 */
export async function statusOf(url: string, referer?: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15000),
      headers: referer ? {Referer: referer} : undefined,
    })
    return response.status
  } catch (err) {
    log.warn(`statusOf ${parts(url).host}${parts(url).path} : ${(err as Error).message}`)
    return null
  }
}

// Sans User-Agent de navigateur, certains sites répondent 403 aux clients « scripts » (cf. le WAF de cybermalveillance ci-dessus).
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const HTTP_TIMEOUT_MS = 15000
/** Début du document lu : le titre et le début du texte visible y figurent, inutile de télécharger la page entière. */
const BODY_LIMIT_BYTES = 65536

/** Texte visible approximatif d'un document HTML : sans script, style ni balises, entités courantes décodées, espaces normalisés. */
function visibleText(html: string): string {
  return decodeNumericEntities(html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
    .replace(/\s+/g, ' ').trim()
}

/**
 * Décrit une cible interceptée (`DeferredLink`) par UNE requête HTTP depuis Node au lieu de la charger dans le navigateur : même
 * `LinkTarget`, donc même classification (`isBrokenTarget`, `isLoginWall`, `isExpectedUnreachable`, `titleMentionsCard`).
 * Statut = celui de la réponse finale après redirections ; pas de réponse (réseau, délai, TLS) : `null`, comme une page d'erreur du
 * navigateur. Hôte et chemin sont ceux de l'adresse FINALE (jamais la requête). Écart connu avec le navigateur : aucun JavaScript
 * exécuté, un titre ou un texte posé côté client (SPA, redirection JS) n'est pas vu ; le statut HTTP, lui, est le même.
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
    log.info(`lien contrôlé en HTTP → ${describeTarget(target)} (statut ${target.status})`)
    return target
  } catch (err) {
    log.warn(`${describeTarget(asked)} sans réponse HTTP : ${(err as Error).message}`)
    return {internal: false, ...asked, status: null, title: 'La page ne répond pas', excerpt: ''}
  }
}

/** Lit au plus `BODY_LIMIT_BYTES` du corps, puis abandonne le flux. */
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

/** Requêtes HTTP simultanées pour le contrôle des cibles interceptées (`describeByHttp`). */
export const HTTP_CONCURRENCY = 6

/** `items` traités par `worker` avec au plus `limit` appels simultanés ; résultats dans l'ordre des `items`. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
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
