import {platform} from '../platform'
import {tl} from './webview'

/**
 * Primitives communes aux Page Objects de la SPA (WebView/webapp). La SPA navigue
 * exclusivement par <button> (aucun <a href> interne, vérifié le 2026-10-02) : tout passe par le
 * nom accessible (CONTRIBUTING.md §2).
 */

/** Clique le bouton visible dont le nom accessible correspond. */
export async function clickButton(name: string | RegExp, timeout = 10000): Promise<void> {
  await platform().inWebContext(async () => {
    const button = await tl().findByRole('button', {name}, {timeout})
    await button.click()
  })
}

/**
 * Attend que tous les boutons attendus soient visibles (listes rendues après un appel API : le
 * titre de section peut être affiché avant ses entrées). `names` : texte exact ou préfixe (RegExp).
 */
export async function waitForButtons(names: Array<string | RegExp>, timeout = 15000): Promise<void> {
  let visible: string[] = []
  await browser.waitUntil(async () => {
    visible = await visibleButtonTexts()
    return names.every(n => visible.some(t => typeof n === 'string' ? t === n : n.test(t)))
  }, {timeout, interval: 400, timeoutMsg: `Boutons attendus absents après ${timeout}ms : ${names.join(' | ')}`})
    .catch((err: Error) => { throw new Error(`${err.message}. Boutons visibles : ${visible.join(' | ')}`) })
}

/**
 * Clique un bouton situé dans le dialogue ouvert qui contient le titre `dialogHeading` — évite les
 * ambiguïtés quand plusieurs dialogues portent le même bouton (ex. « Fermer »). Clic atomique
 * (driver.execute) : le dialogue est re-rendu par Svelte.
 */
export async function clickButtonInDialog(dialogHeading: string, buttonName: string): Promise<void> {
  const clicked = await platform().inWebContext(() =>
    driver.execute((heading: string, name: string) => {
      const dialogs = Array.from(document.querySelectorAll('dialog')) as HTMLDialogElement[]
      const dialog = dialogs.find(d => d.getBoundingClientRect().width > 0 && (d.innerText || '').includes(heading))
      const button = Array.from(dialog?.querySelectorAll('button') ?? []).find(b =>
        ((b as HTMLElement).innerText || '').trim() === name || b.getAttribute('title') === name || b.getAttribute('aria-label') === name
      ) as HTMLElement | undefined
      button?.click()
      return !!button
    }, dialogHeading, buttonName) as Promise<boolean>
  )
  if (!clicked) throw new Error(`Bouton "${buttonName}" introuvable dans le dialogue "${dialogHeading}"`)
}

/** Attend un titre (heading) visible. */
export async function waitForHeading(name: string | RegExp, timeout = 10000): Promise<void> {
  await platform().inWebContext(async () => {
    await tl().findByRole('heading', {name}, {timeout})
  })
}

/** Textes (innerText nettoyé) des boutons actuellement visibles, dans l'ordre du DOM. */
export async function visibleButtonTexts(): Promise<string[]> {
  return await platform().inWebContext(() =>
    driver.execute(() =>
      Array.from(document.querySelectorAll('button'))
        .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        .map(b => ((b as HTMLElement).innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
    ) as Promise<string[]>
  )
}

/** Texte visible de la page (innerText du body, espaces normalisés). */
export async function pageText(): Promise<string> {
  return await platform().inWebContext(() =>
    driver.execute(() => document.body.innerText.replace(/\s+/g, ' ').trim()) as Promise<string>
  )
}

/** Attend que le texte visible de la page contienne `text` (sentinelle de rendu). */
export async function waitForPageText(text: string | RegExp, timeout = 10000): Promise<void> {
  await platform().inWebContext(() =>
    browser.waitUntil(
      async () => {
        const body = await driver.execute(() => document.body.innerText.replace(/\s+/g, ' ')) as string
        return typeof text === 'string' ? body.includes(text) : text.test(body)
      },
      {timeout, interval: 300, timeoutMsg: `Texte ${text} absent de la page après ${timeout}ms`}
    )
  )
}

/** États (coché/décoché) des cases à cocher visibles, indexés par leur attribut `name`. */
export async function checkboxStates(): Promise<Record<string, boolean>> {
  return await platform().inWebContext(() =>
    driver.execute(() => {
      const out: Record<string, boolean> = {}
      document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(i => {
        const r = i.getBoundingClientRect()
        out[i.name || i.id] = i.checked
        // Les cases DSFR sont stylées : <input> peut être de taille 0 mais reste dans le DOM visible.
        void r
      })
      return out
    }) as Promise<Record<string, boolean>>
  )
}
