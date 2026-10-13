import logger from '@wdio/logger'
import {AssertionError} from 'node:assert'
import {platform} from '../platform'
import {findLabel, findRole, findRoleNames, findRoles, findTestId, findText, queryRole} from './dom-query'
import type {FindOptions} from './dom-query'
import {roleSelector} from './selectors'

/**
 * Primitives communes aux Page Objects de la SPA (WebView/webapp). La SPA navigue
 * exclusivement par <button> (aucun <a href> interne, vérifié le 2026-10-02) : tout passe par le
 * nom accessible (CONTRIBUTING.md §2).
 *
 * Deux familles :
 * - **ouvrent le contexte** (`waitForRole`, `clickRole`, `hasRole`, `waitForHeading`…) : utilisables depuis un
 *   Page Object, seules ou dans un `inWebContext` déjà ouvert (il est réentrant, cf. CONTRIBUTING.md §4) ;
 * - **retournent un élément** (`findRole`, `findRoles`, `queryRole`, `findTestId`, `findLabel`, `findText`, de
 *   `dom-query.ts`) : à appeler DANS un `platform().inWebContext()` ouvert, car l'élément ne survit pas à la
 *   sortie de la WebView (lecture d'attribut, saisie, plusieurs actions dans le même contexte).
 */

export type WaitOptions = FindOptions

export {findLabel, findRole, findRoleNames, findRoles, findTestId, findText, queryRole}

const log = logger('helper')

const DEFAULT_TIMEOUT = 10000

/** Attend qu'un élément de rôle `role` et de nom accessible `name` (exact) soit affiché. */
export async function waitForRole(role: string, name: string, opts: DisplayOptions = {}): Promise<void> {
  await platform().inWebContext(async () => {
    await firstDisplayed(roleSelector(role, name), opts)
  })
}

/** `true` si `find` trouve son élément, `false` sur « introuvable » (AssertionError) ; toute autre erreur remonte. */
async function isFound(find: () => Promise<unknown>): Promise<boolean> {
  try {
    await find()
    return true
  } catch (err) {
    if (err instanceof AssertionError) return false
    throw err
  }
}

/**
 * Sonde : un élément de rôle `role` et de nom accessible `name` est-il là sous `timeout` ms (0 : maintenant) ?
 * `false` s'il n'y est pas, ou s'il n'y a pas de WebView (écran natif) ; toute AUTRE erreur (contexte perdu,
 * session morte) remonte au lieu de passer pour « absent ». À utiliser pour savoir sur quel écran l'on est,
 * jamais pour attendre un écran qu'on va utiliser (`waitForRole` / `findRole` attendent déjà).
 */
export async function hasRole(role: string, name?: string | RegExp, timeout = 0): Promise<boolean> {
  if (!await platform().isWebContextAvailable()) return false
  return await platform().inWebContext(async () =>
    timeout <= 0 ? await queryRole(role, name) !== null : await isFound(() => findRole(role, name, {timeout}))
  )
}

/** Comme `hasRole`, pour un élément dont le texte propre correspond (`timeout` > 0 ms). */
export async function hasText(text: string | RegExp, timeout = 1000): Promise<boolean> {
  if (!await platform().isWebContextAvailable()) return false
  return await platform().inWebContext(() => isFound(() => findText(text, {timeout})))
}

// --- Sélecteurs natifs WDIO 10 (`role/…`, `tag*=…`, CSS) -------------------------------------------------------
// À appeler dans une page : elles ouvrent le contexte WebView elles-mêmes. Voir `selectors.ts` pour `role/`.

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

/** Clique l'élément portant `data-testid` (attend sa présence). Réservé aux éléments sans nom accessible stable. */
export async function clickTestId(testId: string, opts: WaitOptions = {}): Promise<void> {
  const {timeout = DEFAULT_TIMEOUT, ...rest} = opts
  await platform().inWebContext(async () => {
    const element = await findTestId(testId, {timeout, ...rest})
    await element.click()
  })
}

/** Attend qu'un élément portant `data-testid` soit présent (sentinelle de rendu). */
export async function waitForTestId(testId: string, opts: WaitOptions = {}): Promise<void> {
  const {timeout = DEFAULT_TIMEOUT, ...rest} = opts
  await platform().inWebContext(async () => {
    await findTestId(testId, {timeout, ...rest})
  })
}

/** Saisit `value` dans le champ associé au libellé `label` (attend sa présence). */
export async function fillByLabel(label: string | RegExp, value: string, opts: WaitOptions = {}): Promise<void> {
  const {timeout = DEFAULT_TIMEOUT, ...rest} = opts
  await platform().inWebContext(async () => {
    const input = await findLabel(label, {timeout, ...rest})
    await input.setValue(value)
  })
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
  await platform().inWebContext(async () => {
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
  })
}

/**
 * Attend que tous les boutons attendus soient affichés (listes rendues après un appel API : le titre de section peut
 * être affiché avant ses entrées). `names` : noms accessibles exacts. Un par un, en séquence : chacun réessaie jusqu'à `timeout`.
 */
export async function waitForButtons(names: string[], timeout = 15000): Promise<void> {
  await platform().inWebContext(async () => {
    for (const name of names) {
      await firstDisplayed(roleSelector('button', name), {timeout})
    }
  })
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
  return await platform().inWebContext(async () => {
    await firstDisplayed(roleSelector('button'), {timeout: 10000})
    const texts: string[] = []
    for (const button of await allDisplayed(roleSelector('button'))) {
      const text = normalizeSpaces(await button.getText())
      if (text) texts.push(text)
    }
    return texts
  })
}

/** Texte visible de la page (espaces normalisés). */
export async function pageText(): Promise<string> {
  return await platform().inWebContext(async () =>
    (await $('body').getText()).replace(/\s+/g, ' ').trim()
  )
}

/** Attend que le texte visible de la page contienne `text` (sentinelle de rendu) : assertion WDIO avec attente. */
export async function waitForPageText(text: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await platform().inWebContext(async () => {
    await expect($('body')).toHaveText(text, {containing: true, wait: timeout})
  })
}

/**
 * Sonde : le texte visible de la page contient-il `text` sous `timeout` ms ? `false` sans WebView. Seul l'échec « délai
 * dépassé » vaut `false` : toute autre erreur (contexte perdu, session morte) remonte.
 */
export async function hasPageText(text: string, timeout = 1000): Promise<boolean> {
  if (!await platform().isWebContextAvailable()) return false
  return await platform().inWebContext(async () => {
    try {
      await browser.waitUntil(async () => (await $('body').getText()).includes(text), {timeout, interval: 300})
      return true
    } catch (err) {
      if (/^waitUntil condition timed out/.test((err as Error).message)) return false
      throw err
    }
  })
}

/**
 * États (coché/décoché) des cases à cocher, indexés par leur attribut `name` (à défaut `id`). Attend qu'au moins une
 * case soit rendue. Pas de filtre « affiché » : l'`<input>` d'une case DSFR est transparent derrière son libellé.
 */
export async function checkboxStates(): Promise<Record<string, boolean>> {
  return await platform().inWebContext(async () => {
    const selector = roleSelector('checkbox')
    await browser.waitUntil(async () => (await $$(selector)).length > 0, {timeout: 10000, timeoutMsg: 'Aucune case à cocher affichée après 10000ms'})
    const out: Record<string, boolean> = {}
    for (const box of await $$(selector)) {
      const key = (await box.getAttribute('name')) || (await box.getAttribute('id')) || ''
      out[key] = await box.isSelected()
    }
    return out
  })
}
