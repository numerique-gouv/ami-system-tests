import {AssertionError} from 'node:assert'
import {platform} from '../../platform'
import {roleSelector} from './selectors'

const DEFAULT_TIMEOUT = 10000

/** Attend qu'un élément de rôle `role` et de nom accessible `name` (exact) soit affiché. */
export async function waitForRole(role: string, name: string, opts: DisplayOptions = {}): Promise<void> {
  await firstDisplayed(roleSelector(role, name), opts)
}

/** `within` : sélecteur du conteneur où chercher. */
export interface DisplayOptions {
  timeout?: number
  within?: string
}

/** Tous les éléments affichés de `selector`, tout de suite, dans l'ordre du DOM. */
export async function allDisplayed(selector: string, {within}: DisplayOptions = {}): Promise<WebdriverIO.Element[]> {
  const out: WebdriverIO.Element[] = []
  for (const element of within ? await $(within).$$(selector) : await $$(selector)) {
    if (await element.isDisplayed()) out.push(element)
  }
  return out
}

/** Premier élément affiché de `selector`, tout de suite, sinon `null`. */
async function queryDisplayed(selector: string, {within}: DisplayOptions = {}): Promise<WebdriverIO.Element | null> {
  const found = within ? await $(within).$$(selector) : await $$(selector)
  for (const element of found) {
    if (await element.isDisplayed()) return element
  }
  return null
}

/** Attend le premier élément affiché de `selector` (dans l'ordre du DOM) et le retourne ; à appeler dans un `inWebContext` ouvert. */
export async function firstDisplayed(selector: string, opts: DisplayOptions = {}): Promise<WebdriverIO.Element> {
  const {timeout = DEFAULT_TIMEOUT, within} = opts
  let found: WebdriverIO.Element | null = null
  try {
    await browser.waitUntil(async () => (found = await queryDisplayed(selector, opts)) !== null, {timeout, interval: 200})
  } catch {
    throw new AssertionError({message: `Aucun élément affiché pour « ${selector} »${within ? ` dans « ${within} »` : ''} après ${timeout}ms`})
  }
  return found as unknown as WebdriverIO.Element
}

/** Un élément de `selector` est-il affiché sous `timeout` ms (0 : maintenant) ? `false` sans WebView. */
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

/** EXCEPTION : à réserver à un clic dont la perte est avérée (re-rendu concurrent). Clique jusqu'à ce que le bouton disparaisse. */
export async function clickButtonUntilGone(name: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  const selector = roleSelector('button', name)
  await firstDisplayed(selector, {timeout})
  await browser.waitUntil(async () => {
    const button = await queryDisplayed(selector)
    if (!button) return true
    await button.click().catch(() => undefined)
    return false
  }, {
    timeout, interval: 500,
    timeoutMsg: `Le bouton "${name}" est toujours affiché après ${timeout}ms de clics répétés`,
  })
}

/** Attend, un par un, que les boutons de noms accessibles exacts `names` soient affichés. */
export async function waitForButtons(names: string[], timeout = 15000): Promise<void> {
  for (const name of names) {
    await firstDisplayed(roleSelector('button', name), {timeout})
  }
}

/** Attend un titre (heading) affiché, de nom accessible `name` (exact). */
export async function waitForHeading(name: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await waitForRole('heading', name, {timeout})
}

export const normalizeSpaces = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Textes visibles des boutons affichés, sans les boutons-icônes (`getComputedLabel` n'existe pas dans la WebView iOS). */
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
  return normalizeSpaces(await $('body').getText())
}

export async function waitForPageText(text: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await expect($('body')).toHaveText(text, {containing: true, wait: timeout})
}

/** Le texte visible contient-il `text` sous `timeout` ms ? `false` sans WebView ou si le délai est dépassé ; toute autre erreur remonte. */
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

/** Coche ou décoche la case d'attribut `name` (à défaut `id`) en cliquant son label : l'input DSFR est recouvert par lui. */
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

/** États des cases à cocher, par `name` (à défaut `id`). Pas de filtre « affiché » : l'input d'une case DSFR est transparent. */
export async function checkboxStates(): Promise<Record<string, boolean>> {
  const selector = roleSelector('checkbox')
  await browser.waitUntil(async () => (await $$(selector)).length > 0, {timeout: 10000, timeoutMsg: 'Aucune case à cocher affichée après 10000ms'})
  // Un seul aller-retour plutôt que 3 requêtes par case.
  return await browser.execute(() => Object.fromEntries(
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .map(box => [box.name || box.id || '', box.checked]),
  ))
}

/** Recharge la page courante de la SPA, session conservée. */
export async function reloadPage(): Promise<void> {
  if (browser.isMobile) await browser.execute(() => window.location.reload())
  else await browser.refresh()
}
