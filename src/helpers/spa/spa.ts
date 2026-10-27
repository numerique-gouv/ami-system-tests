import logger from '@wdio/logger'
import {AssertionError} from 'node:assert'
import {platform} from '../../platform'
import {roleSelector} from './selectors'

/**
 * Primitives communes aux Page Objects de la SPA (WebView/webapp), au-dessus des sélecteurs natifs de WDIO 10
 * (`role/<rôle>[name=…]`, `tag*=texte`, CSS, `aria/…`, cf. `selectors.ts` et CONTRIBUTING.md §2). Convention (CONTRIBUTING.md §4) :
 * l'APPELANT MOBILE ouvre le `inWebContext` (un par test ou par flow) ; les Page Objects et aides ne s'enveloppent pas, sauf
 * `isShown` et `clickDisplayed` qui gardent leur enveloppe : les flows mixtes natif/WebView (`authenticate.process.ts`, pages
 * d'onboarding et FranceConnect) les appellent sans enveloppe (réentrant : sans effet dans une WebView déjà active). Les aides qui
 * RETOURNENT un élément (`firstDisplayed`, `allDisplayed`) se lisent et s'utilisent DANS un `inWebContext` ouvert : l'élément ne
 * survit pas à la sortie de la WebView.
 *
 * Le nom accessible de `role/…[name=…]` est comparé EXACTEMENT, tel que le moteur le calcule (Chrome garde par exemple
 * une espace finale pour un bouton icône + texte) : pour un nom partiel ou incertain, utiliser `tag*=texte`.
 */

const log = logger('helper')

const DEFAULT_TIMEOUT = 10000

/** Attend qu'un élément de rôle `role` et de nom accessible `name` (exact) soit affiché. */
export async function waitForRole(role: string, name: string, opts: DisplayOptions = {}): Promise<void> {
  await firstDisplayed(roleSelector(role, name), opts)
}

// --- Sélecteurs natifs WDIO 10 (`role/…`, `tag*=…`, CSS) -------------------------------------------------------
// À appeler depuis un `inWebContext` ouvert par l'appelant (sauf `isShown` et `clickDisplayed`). Voir `selectors.ts` pour `role/`.

/** Options des aides ci-dessous. `within` : sélecteur du conteneur où chercher. */
export interface DisplayOptions {
  timeout?: number
  within?: string
}

/** Tous les éléments AFFICHÉS de `selector`, tout de suite, dans l'ordre du DOM. Ne lève jamais « strict ». */
export async function allDisplayed(selector: string, {within}: DisplayOptions = {}): Promise<WebdriverIO.Element[]> {
  const out: WebdriverIO.Element[] = []
  for (const element of within ? await $(within).$$(selector) : await $$(selector)) {
    if (await element.isDisplayed()) out.push(element)
  }
  return out
}

/** Premier élément AFFICHÉ de `selector`, tout de suite, sinon `null`. Ne lève jamais « strict ». */
async function queryDisplayed(selector: string, {within}: DisplayOptions = {}): Promise<WebdriverIO.Element | null> {
  const found = within ? await $(within).$$(selector) : await $$(selector)
  for (const element of found) {
    if (await element.isDisplayed()) return element
  }
  return null
}

/**
 * Attend le premier élément affiché de `selector`, et le retourne. À appeler DANS un `inWebContext` ouvert (l'élément ne
 * survit pas à la sortie de la WebView). Plusieurs correspondances ne posent pas de problème (liste d'éléments au même
 * nom) : on prend le premier affiché, dans l'ordre du DOM.
 */
export async function firstDisplayed(selector: string, opts: DisplayOptions = {}): Promise<WebdriverIO.Element> {
  const {timeout = DEFAULT_TIMEOUT, within} = opts
  let found: WebdriverIO.Element | null = null
  try {
    await browser.waitUntil(async () => (found = await queryDisplayed(selector, opts)) !== null, {timeout, interval: 200})
  } catch (err) {
    throw new AssertionError({message: `Aucun élément affiché pour « ${selector} »${within ? ` dans « ${within} »` : ''} après ${timeout}ms (${(err as Error).message})`})
  }
  return found as unknown as WebdriverIO.Element
}

/** Sonde : un élément de `selector` est-il affiché sous `timeout` ms (0 : maintenant) ? `false` sans WebView ; toute autre erreur remonte. */
export async function isShown(selector: string, timeout = 0, opts: Omit<DisplayOptions, 'timeout'> = {}): Promise<boolean> {
  if (!await platform().isWebContextAvailable()) return false
  return await platform().inWebContext(async () => {
    if (timeout <= 0) return await queryDisplayed(selector, opts) !== null
    try {
      await firstDisplayed(selector, {...opts, timeout})
      return true
    } catch (err) {
      if (err instanceof AssertionError) return false
      throw err
    }
  })
}

/** Clique le premier élément affiché de `selector` (attend sa présence). */
export async function clickDisplayed(selector: string, opts: DisplayOptions = {}): Promise<void> {
  await platform().inWebContext(async () => {
    await (await firstDisplayed(selector, opts)).click()
  })
}

/** Clique l'élément de rôle `role` et de nom accessible `name` (exact). */
export async function clickRole(role: string, name: string, opts: DisplayOptions = {}): Promise<void> {
  await clickDisplayed(roleSelector(role, name), opts)
}

/** Clique le bouton dont le nom accessible est `name` (exact). */
export async function clickButton(name: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await clickRole('button', name, {timeout})
}

/**
 * Clique le bouton jusqu'à ce qu'il disparaisse de la page d'origine. EXCEPTION, pas le comportement
 * par défaut : un clic est normalement considéré comme pris en compte. À réserver à un clic dont la
 * perte est avérée (re-rendu concurrent) — observé sur « Services » (checklists, 3 échecs sur 5 en
 * campagne du 2026-10-06). Le bouton absent prouve le clic sans que la page d'origine connaisse la suivante.
 */
export async function clickButtonUntilGone(name: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  const selector = roleSelector('button', name)
  await firstDisplayed(selector, {timeout})
  await browser.waitUntil(async () => {
    const button = await queryDisplayed(selector)
    if (!button) return true
    await button.click().catch((err: Error) => {
      log.warn(`clickButtonUntilGone : clic sur "${name}" en échec (${err.message})`)
    })
    return false
  }, {
    timeout, interval: 500,
    timeoutMsg: `Le bouton "${name}" est toujours affiché après ${timeout}ms de clics répétés`,
  })
}

/**
 * Attend que tous les boutons attendus soient affichés (listes rendues après un appel API : le titre de section peut
 * être affiché avant ses entrées). `names` : noms accessibles exacts. Un par un, en séquence : chacun réessaie jusqu'à `timeout`.
 */
export async function waitForButtons(names: string[], timeout = 15000): Promise<void> {
  for (const name of names) {
    await firstDisplayed(roleSelector('button', name), {timeout})
  }
}

/** Attend un titre (heading) affiché, de nom accessible `name` (exact). */
export async function waitForHeading(name: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await waitForRole('heading', name, {timeout})
}

const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * Textes des boutons actuellement affichés, dans l'ordre du DOM, sans les boutons sans texte (icônes). Attend qu'au moins
 * un bouton soit rendu. Texte visible (`getText`) et non nom accessible : `getComputedLabel` n'existe pas dans la
 * WebView iOS.
 */
export async function visibleButtonTexts(): Promise<string[]> {
  await firstDisplayed(roleSelector('button'), {timeout: 10000})
  const texts: string[] = []
  for (const button of await allDisplayed(roleSelector('button'))) {
    const text = normalizeSpaces(await button.getText())
    if (text) texts.push(text)
  }
  return texts
}

/** Texte visible de la page (espaces normalisés). */
export async function pageText(): Promise<string> {
  return (await $('body').getText()).replace(/\s+/g, ' ').trim()
}

/** Attend que le texte visible de la page contienne `text` (sentinelle de rendu) : assertion WDIO avec attente. */
export async function waitForPageText(text: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await expect($('body')).toHaveText(text, {containing: true, wait: timeout})
}

/**
 * Sonde : le texte visible de la page contient-il `text` sous `timeout` ms ? `false` sans WebView. Seul l'échec « délai
 * dépassé » vaut `false` : toute autre erreur (contexte perdu, session morte) remonte.
 */
export async function hasPageText(text: string, timeout = 1000): Promise<boolean> {
  if (!await platform().isWebContextAvailable()) return false
  try {
    await browser.waitUntil(async () => (await $('body').getText()).includes(text), {timeout, interval: 300})
    return true
  } catch (err) {
    if (/^waitUntil condition timed out/.test((err as Error).message)) return false
    throw err
  }
}

/**
 * Coche ou décoche la case dont l'attribut `name` — à défaut `id`, comme la clé de `checkboxStates()` — est `name`, puis attend
 * qu'elle ait l'état demandé. Sans effet si elle l'a déjà. L'`<input>` DSFR (`fr-toggle__input`, `fr-checkbox`) est recouvert par
 * son `<label for=id>` : un clic sur l'input est refusé (« element click intercepted », relevé en live le 2026-10-15), c'est le
 * label qui reçoit le clic, comme pour l'usager. `$()` + `waitForExist` : l'input n'est pas « affiché » au sens WebDriver.
 */
export async function setCheckbox(name: string, checked: boolean): Promise<void> {
  const box = $(`input[type="checkbox"][name="${name}"], input[type="checkbox"][id="${name}"]`)
  await box.waitForExist({timeout: DEFAULT_TIMEOUT, timeoutMsg: `Case « ${name} » absente après ${DEFAULT_TIMEOUT}ms`})
  if (await box.isSelected() !== checked) {
    const id = await box.getAttribute('id')
    await (id ? $(`label[for="${id}"]`) : box).click()
  }
  await browser.waitUntil(async () => await box.isSelected() === checked, {
    timeout: 5000, interval: 200, timeoutMsg: `La case « ${name} » n'est pas passée à ${checked ? 'cochée' : 'décochée'} après 5000ms`,
  })
}

/**
 * États (coché/décoché) des cases à cocher, indexés par leur attribut `name` (à défaut `id`). Attend qu'au moins une
 * case soit rendue. Pas de filtre « affiché » : l'`<input>` d'une case DSFR est transparent derrière son libellé.
 */
export async function checkboxStates(): Promise<Record<string, boolean>> {
  const selector = roleSelector('checkbox')
  await browser.waitUntil(async () => (await $$(selector)).length > 0, {timeout: 10000, timeoutMsg: 'Aucune case à cocher affichée après 10000ms'})
  const out: Record<string, boolean> = {}
  for (const box of await $$(selector)) {
    const key = (await box.getAttribute('name')) || (await box.getAttribute('id')) || ''
    out[key] = await box.isSelected()
  }
  return out
}

/**
 * Recharge la page courante de la SPA (la session est conservée).
 * Webapp : `browser.refresh()`. `driver.execute(() => window.location.reload())` y échoue avec « Cannot find context with specified id » :
 * WDIO 10 exécute le script par BiDi (`script.callFunction`, awaitPromise) et la page est détruite pendant l'appel (20 échecs sur 20 après un
 * changement de hash, 0 sur 20 avec `browser.refresh()` ; sonde du 2026-10-27 en Chrome 156).
 * Mobile : `execute` conservé (pas de BiDi ; sur iOS le geste natif peut être bloqué par un UIRefreshControl, cf. appium.adapter.ts).
 */
export async function reloadPage(): Promise<void> {
  if (browser.isMobile) await browser.execute(() => window.location.reload())
  else await browser.refresh()
}
