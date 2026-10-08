import {AssertionError} from 'node:assert'

/**
 * Recherche d'éléments de la SPA par sens (rôle + nom accessible, libellé, texte, data-testid), sans
 * Testing Library — abandonné, et son `within()` est cassé sous WDIO 9.
 *
 * Chaque tentative est UN appel `browser.execute` synchrone : la recherche et le marquage de l'élément
 * trouvé se font dans le même tour de boucle JS, donc sans fenêtre de re-rendu entre « trouver » et
 * « marquer ». L'élément est ensuite récupéré par son marqueur (`data-wdio-pick`), comme le faisait
 * Testing Library. Valable dans n'importe quel contexte WebView / webapp (JS standard) ; à appeler
 * à l'intérieur de `platform().inWebContext()`.
 *
 * Le calcul du nom accessible est une approximation volontairement simple de la spécification
 * (aria-labelledby, aria-label, valeur d'un `input` bouton, texte visible, `title`) : suffisant pour les
 * boutons, titres, liens, onglets, dialogues et barres de navigation de la SPA.
 */

/** Élément WDIO retourné : même type que `$()` (un ChainablePromiseElement : on enchaîne les méthodes directement). */
export type PageElement = ReturnType<typeof $>

export interface FindOptions {
  /** Durée maximale de la recherche (défaut 10 000 ms). */
  timeout?: number
  /** Délai entre deux tentatives (défaut 200 ms). */
  interval?: number
}

export interface RoleOptions extends FindOptions {
  /** Niveau d'un titre (`h3` → 3). */
  level?: number
  /**
   * Limite la recherche à l'intérieur d'un conteneur (rôle + nom), résolu dans la MÊME exécution que la
   * recherche : pas d'élément englobant gardé d'un appel à l'autre, donc rien qui puisse devenir périmé
   * si Svelte recrée le conteneur.
   */
  in?: {role: string, name?: Matcher}
}

type Matcher = string | RegExp

interface SerializedMatcher {
  kind: 'string' | 'regexp'
  value: string
  flags?: string
}

interface PageQuery {
  by: 'role' | 'testId' | 'label' | 'text'
  role?: string
  name?: SerializedMatcher | null
  level?: number
  within?: {role: string, name?: SerializedMatcher | null}
  testId?: string
  exact?: boolean
  all: boolean
}

interface PageResult {
  count: number
  /** Noms (ou textes) des candidats vus, pour le message d'échec. */
  seen: string[]
  /** Noms accessibles des éléments trouvés, dans l'ordre du DOM (lecture atomique, sans aller-retour par élément). */
  names: string[]
}

const DEFAULT_TIMEOUT = 10000
const DEFAULT_INTERVAL = 200

function serialize(matcher: Matcher | undefined): SerializedMatcher | null {
  if (matcher === undefined) return null
  return matcher instanceof RegExp
    ? {kind: 'regexp', value: matcher.source, flags: matcher.flags}
    : {kind: 'string', value: matcher}
}

function serializeWithin(within: RoleOptions['in']): PageQuery['within'] {
  return within ? {role: within.role, name: serialize(within.name)} : undefined
}

function describeWithin(within: RoleOptions['in']): string {
  return within ? ` dans ${within.role}${describeMatcher(within.name)}` : ''
}

function describeMatcher(matcher: Matcher | undefined): string {
  if (matcher === undefined) return ''
  return matcher instanceof RegExp ? ` ${matcher}` : ` "${matcher}"`
}

/**
 * Exécutée DANS la page (sérialisée par WDIO) : doit être autonome, sans référence à ce module.
 * Marque les éléments trouvés avec `data-wdio-pick="<token>"`.
 */
function pickInPage(query: PageQuery, token: string): PageResult {
  const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (el: Element): string => norm((el as HTMLElement).innerText ?? el.textContent)
  const matches = (value: string, m: SerializedMatcher | null | undefined, exact = true): boolean => {
    if (!m) return true
    if (m.kind === 'regexp') return new RegExp(m.value, m.flags).test(value)
    return exact ? value === norm(m.value) : value.toLowerCase().includes(norm(m.value).toLowerCase())
  }

  // Accessible : ni masqué (display / visibility / hidden / inert), ni sous un aria-hidden="true".
  const accessible = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if ((node as HTMLElement).hidden || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true') return false
      if (getComputedStyle(node).display === 'none') return false
    }
    return getComputedStyle(el).visibility !== 'hidden'
  }

  const nameOf = (el: Element): string => {
    const labelledBy = el.getAttribute('aria-labelledby')
    if (labelledBy) {
      const t = norm(labelledBy.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean)
        .map(n => textOf(n as Element)).join(' '))
      if (t) return t
    }
    const ariaLabel = norm(el.getAttribute('aria-label'))
    if (ariaLabel) return ariaLabel
    if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) return norm(el.value)
    if (el instanceof HTMLImageElement) return norm(el.alt)
    return textOf(el) || norm(el.getAttribute('title'))
  }

  const roleSelectors: Record<string, string> = {
    button: 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]',
    heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
    link: 'a[href], [role="link"]',
    tab: '[role="tab"]',
    dialog: 'dialog, [role="dialog"]',
    navigation: 'nav, [role="navigation"]',
    checkbox: 'input[type="checkbox"], [role="checkbox"]',
    textbox: 'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="password"], textarea, [role="textbox"]',
  }

  const seen: string[] = []
  let found: Element[] = []

  const byRole = (role: string, name: SerializedMatcher | null | undefined, level: number | undefined, record: boolean): Element[] => {
    const selector = roleSelectors[role] ?? `[role="${role}"]`
    return Array.from(document.querySelectorAll(selector)).filter(el => {
      // Un rôle explicite différent l'emporte sur le rôle implicite de la balise (<button role="tab">).
      const explicit = el.getAttribute('role')
      if (explicit && explicit !== role) return false
      if (!accessible(el)) return false
      if (level !== undefined) {
        const found = Number(el.getAttribute('aria-level') ?? /^H([1-6])$/.exec(el.tagName)?.[1])
        if (found !== level) return false
      }
      const elName = nameOf(el)
      if (record && seen.length < 15) seen.push(elName)
      return matches(elName, name)
    })
  }

  if (query.by === 'role') {
    let container: Element | null = null
    if (query.within) {
      container = byRole(query.within.role, query.within.name, undefined, false)[0] ?? null
      if (!container) return {count: 0, seen: [`(conteneur ${query.within.role} introuvable)`], names: []}
    }
    found = byRole(query.role as string, query.name, query.level, true)
      .filter(el => !container || container.contains(el))
  } else if (query.by === 'testId') {
    found = Array.from(document.querySelectorAll(`[data-testid="${(query.testId as string).replace(/"/g, '\\"')}"]`))
  } else if (query.by === 'label') {
    const controls = new Set<Element>()
    for (const label of Array.from(document.querySelectorAll('label'))) {
      if (!accessible(label)) continue
      const text = textOf(label)
      if (seen.length < 15) seen.push(text)
      if (!matches(text, query.name)) continue
      const control = (label as HTMLLabelElement).control
      if (control) controls.add(control)
    }
    for (const el of Array.from(document.querySelectorAll('[aria-label]'))) {
      if (matches(norm(el.getAttribute('aria-label')), query.name)) controls.add(el)
    }
    found = Array.from(controls)
  } else {
    // Texte : éléments dont le texte PROPRE (nœuds texte directs) correspond — comme getByText.
    found = Array.from(document.querySelectorAll('body *')).filter(el => {
      if (['SCRIPT', 'STYLE'].includes(el.tagName) || !accessible(el)) return false
      const own = norm(Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '))
      if (!own) return false
      if (seen.length < 15) seen.push(own)
      return matches(own, query.name, query.exact !== false)
    })
  }

  if (!query.all) found = found.slice(0, 1)
  found.forEach(el => el.setAttribute('data-wdio-pick', token))
  return {count: found.length, seen, names: found.map(nameOf)}
}

function newToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function attempt(query: PageQuery, token: string): Promise<PageResult> {
  return await browser.execute(pickInPage, query, token) as PageResult
}

/**
 * Erreurs d'exécution qui signifient « le document est en train d'être remplacé » (navigation pendant
 * l'appel) : transitoires par nature, la boucle de recherche réessaie. Observé sur Chrome (BiDi) :
 * « Cannot find context with specified id » en changeant de route.
 */
const TRANSIENT_NAVIGATION_ERROR =
  /Cannot find context|no such window|no such execution context|execution context was destroyed|Inspected target navigated|detached|target frame|context was discarded|navigat/i

async function locate(query: PageQuery, label: string, opts: FindOptions): Promise<{token: string, names: string[]}> {
  const {timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL} = opts
  const token = newToken()
  const deadline = Date.now() + timeout
  let last: PageResult = {count: 0, seen: [], names: []}
  let lastTransient = ''
  for (;;) {
    try {
      last = await attempt(query, token)
      if (last.count > 0) return {token, names: last.names}
    } catch (err) {
      if (!TRANSIENT_NAVIGATION_ERROR.test(String(err))) throw err
      lastTransient = String(err).split('\n')[0].slice(0, 160)
    }
    if (Date.now() >= deadline) break
    await browser.pause(interval)
  }
  const seen = last.seen.length ? ` Candidats vus : ${JSON.stringify(last.seen)}.` : ''
  const transient = lastTransient ? ` Dernière erreur transitoire : ${lastTransient}.` : ''
  throw new AssertionError({message: `${label} introuvable après ${timeout}ms.${seen}${transient}`})
}

const pick = (token: string): string => `[data-wdio-pick="${token}"]`

/** Attend un élément de rôle `role` (et de nom accessible `name`, texte exact ou RegExp) et le retourne. */
export async function findRole(role: string, name?: Matcher, opts: RoleOptions = {}): Promise<PageElement> {
  const query: PageQuery = {by: 'role', role, name: serialize(name), level: opts.level, within: serializeWithin(opts.in), all: false}
  const {token} = await locate(query, `Élément ${role}${describeMatcher(name)}${describeWithin(opts.in)}`, opts)
  return $(pick(token))
}

/** Attend au moins un élément de rôle `role` (filtré par nom et/ou niveau) et les retourne tous, dans l'ordre du DOM. */
export async function findRoles(role: string, name?: Matcher, opts: RoleOptions = {}): Promise<PageElement[]> {
  const query: PageQuery = {by: 'role', role, name: serialize(name), level: opts.level, within: serializeWithin(opts.in), all: true}
  const {token} = await locate(query, `Éléments ${role}${describeMatcher(name)}${describeWithin(opts.in)}`, opts)
  return Array.from(await $$(pick(token))) as unknown as PageElement[]
}

/**
 * Attend au moins un élément de rôle `role` (filtré par nom et/ou niveau) et retourne leurs noms accessibles,
 * dans l'ordre du DOM — en UNE exécution, donc cohérents entre eux même si la page se re-rend.
 */
export async function findRoleNames(role: string, name?: Matcher, opts: RoleOptions = {}): Promise<string[]> {
  const query: PageQuery = {by: 'role', role, name: serialize(name), level: opts.level, within: serializeWithin(opts.in), all: true}
  const {names} = await locate(query, `Éléments ${role}${describeMatcher(name)}${describeWithin(opts.in)}`, opts)
  return names
}

/** Sans attente : l'élément de rôle `role` et de nom `name` s'il est là maintenant, sinon `null`. */
export async function queryRole(role: string, name?: Matcher, opts: Pick<RoleOptions, 'level' | 'in'> = {}): Promise<PageElement | null> {
  const token = newToken()
  const result = await attempt({by: 'role', role, name: serialize(name), level: opts.level, within: serializeWithin(opts.in), all: false}, token)
  return result.count > 0 ? $(pick(token)) : null
}

/** Attend un élément portant `data-testid` (dernier recours documenté, cf. CONTRIBUTING.md §2). */
export async function findTestId(testId: string, opts: FindOptions = {}): Promise<PageElement> {
  const {token} = await locate({by: 'testId', testId, all: false}, `Élément data-testid="${testId}"`, opts)
  return $(pick(token))
}

/** Attend le champ associé au libellé `label` (`<label for>`, label englobant ou aria-label). */
export async function findLabel(label: Matcher, opts: FindOptions = {}): Promise<PageElement> {
  const {token} = await locate({by: 'label', name: serialize(label), all: false}, `Champ de libellé${describeMatcher(label)}`, opts)
  return $(pick(token))
}

/**
 * Attend un élément dont le texte propre correspond. Texte exact par défaut ; `exact: false` pour une
 * sous-chaîne insensible à la casse.
 */
export async function findText(text: Matcher, opts: FindOptions & {exact?: boolean} = {}): Promise<PageElement> {
  const {token} = await locate({by: 'text', name: serialize(text), exact: opts.exact, all: false}, `Texte${describeMatcher(text)}`, opts)
  return $(pick(token))
}
