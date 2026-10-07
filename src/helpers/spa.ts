import {platform} from '../platform'
import {findLabel, findRole, findRoleNames, findRoles, findTestId, findText, queryRole} from './dom-query'
import type {FindOptions, RoleOptions} from './dom-query'

/**
 * Primitives communes aux Page Objects de la SPA (WebView/webapp), sans Testing Library. La SPA navigue
 * exclusivement par <button> (aucun <a href> interne, vérifié le 2026-10-02) : tout passe par le
 * nom accessible (CONTRIBUTING.md §2).
 *
 * Deux familles :
 * - **ouvrent le contexte** (`waitForRole`, `clickRole`, `clickButton`, `waitForHeading`…) : utilisables
 *   depuis un Page Object, hors `inWebContext` ;
 * - **nues** (`findRole`, `findRoles`, `queryRole`, `findTestId`, `findLabel`, `findText`, de
 *   `dom-query.ts`) : à appeler DANS un `platform().inWebContext()` déjà ouvert, quand l'élément trouvé
 *   est réutilisé (lecture d'attribut, saisie, plusieurs actions dans le même contexte).
 */

export type WaitOptions = FindOptions

export {findLabel, findRole, findRoleNames, findRoles, findTestId, findText, queryRole}

const DEFAULT_TIMEOUT = 10000

/** Attend qu'un élément de rôle `role` et de nom accessible `name` (texte exact ou RegExp) soit présent. */
export async function waitForRole(role: string, name?: string | RegExp, opts: RoleOptions = {}): Promise<void> {
  const {timeout = DEFAULT_TIMEOUT, ...rest} = opts
  await platform().inWebContext(async () => {
    await findRole(role, name, {timeout, ...rest})
  })
}

/** Clique l'élément de rôle `role` et de nom accessible `name` (attend sa présence). */
export async function clickRole(role: string, name: string | RegExp, opts: WaitOptions = {}): Promise<void> {
  const {timeout = DEFAULT_TIMEOUT, ...rest} = opts
  await platform().inWebContext(async () => {
    const element = await findRole(role, name, {timeout, ...rest})
    await element.click()
  })
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

/** Clique le bouton visible dont le nom accessible correspond. */
export async function clickButton(name: string | RegExp, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await clickRole('button', name, {timeout})
}

/**
 * Clique le bouton jusqu'à ce qu'il disparaisse de la page d'origine. EXCEPTION, pas le comportement
 * par défaut : un clic est normalement considéré comme pris en compte. À réserver à un clic dont la
 * perte est avérée (re-rendu concurrent) — observé sur « Services » (checklists, 3 échecs sur 5 en
 * campagne du 2026-10-06). Le bouton absent prouve le clic sans que la page d'origine connaisse la suivante.
 */
export async function clickButtonUntilGone(name: string | RegExp, timeout = 10000): Promise<void> {
  await platform().inWebContext(async () => {
    await findRole('button', name, {timeout})
    await browser.waitUntil(async () => {
      const button = await queryRole('button', name).catch(() => null)
      if (!button) return true
      await button.click().catch(() => {})
      return false
    }, {
      timeout, interval: 500,
      timeoutMsg: `Le bouton "${name}" est toujours affiché après ${timeout}ms de clics répétés`,
    })
  })
}

/**
 * Attend que tous les boutons attendus soient visibles (listes rendues après un appel API : le
 * titre de section peut être affiché avant ses entrées). `names` : texte exact ou RegExp.
 * Un `findRole` par bouton, en séquence : chacun réessaie jusqu'à `timeout`.
 */
export async function waitForButtons(names: Array<string | RegExp>, timeout = 15000): Promise<void> {
  await platform().inWebContext(async () => {
    for (const name of names) {
      await findRole('button', name, {timeout})
    }
  })
}

/**
 * Clique un bouton situé dans le dialogue dont le nom accessible est `dialogName` — lève l'ambiguïté
 * quand plusieurs dialogues portent le même bouton (ex. « Fermer »). La portée « dans ce dialogue » est
 * résolue dans la même exécution que la recherche du bouton (option `in`).
 */
export async function clickButtonInDialog(dialogName: string | RegExp, buttonName: string | RegExp): Promise<void> {
  await platform().inWebContext(async () => {
    const button = await findRole('button', buttonName, {timeout: 10000, in: {role: 'dialog', name: dialogName}})
    await button.waitForClickable({timeout: 5000})
    await button.click()
  })
}

/** Attend un titre (heading) visible. */
export async function waitForHeading(name: string | RegExp, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await waitForRole('heading', name, {timeout})
}

/**
 * Noms accessibles des boutons actuellement visibles, dans l'ordre du DOM. Attend qu'au moins un bouton
 * soit rendu. Lecture atomique (une seule exécution) : pas d'élément par élément pendant qu'une page ou un
 * accordéon se re-rend.
 */
export async function visibleButtonTexts(): Promise<string[]> {
  return await platform().inWebContext(async () =>
    (await findRoleNames('button', undefined, {timeout: 10000})).filter(Boolean)
  )
}

/** Texte visible de la page (espaces normalisés). */
export async function pageText(): Promise<string> {
  return await platform().inWebContext(async () =>
    (await $('body').getText()).replace(/\s+/g, ' ').trim()
  )
}

/** Attend qu'un élément dont le texte contient `text` soit visible (sentinelle de rendu). */
export async function waitForPageText(text: string | RegExp, timeout = 10000): Promise<void> {
  await platform().inWebContext(async () => {
    await findText(text, {timeout, exact: typeof text === 'string' ? false : undefined})
  })
}

/**
 * États (coché/décoché) des cases à cocher visibles, indexés par leur attribut `name` (à défaut `id`).
 * Attend qu'au moins une case soit rendue.
 */
export async function checkboxStates(): Promise<Record<string, boolean>> {
  return await platform().inWebContext(async () => {
    const out: Record<string, boolean> = {}
    for (const box of await findRoles('checkbox', undefined, {timeout: 10000})) {
      const key = (await box.getAttribute('name')) || (await box.getAttribute('id')) || ''
      out[key] = await box.isSelected()
    }
    return out
  })
}
