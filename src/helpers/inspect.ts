/**
 * Helper d'inspection cross-platform pour la mise au point interactive de tests.
 *
 * Utilisation typique depuis un test avec browser.debug() :
 *
 *   await browser.debug()
 *   // Dans le REPL :
 *   > await listInteractive()                                   // contexte natif courant
 *   > await withWebView(async () => await listInteractive())    // contenu WebView
 */

export type InteractiveElement = {
  index: number
  context: 'WEBVIEW' | 'NATIVE'
  platform: 'android' | 'ios'
  role: string
  label: string
  selectorHint: string
}

type WebInteractiveElement = {
  tag: string
  role: string
  text: string
  ariaLabel: string
  href: string
  id: string
  testingLibraryQuery: string
}

/**
 * Liste les éléments interactifs du contexte Appium courant (WEBVIEW_* ou NATIVE_APP),
 * affiche un tableau dans la console, et retourne les éléments pour usage programmatique.
 *
 * Ne fait aucun switch de contexte. L'appelant doit se placer dans le bon contexte
 * avant d'appeler cette fonction (withWebView() pour la WebView, rien pour NATIVE_APP).
 */
export async function listInteractive(opts?: {
  limit?: number
  silent?: boolean
}): Promise<InteractiveElement[]> {
  const limit = opts?.limit ?? 50
  const silent = opts?.silent ?? false

  const ctxRaw = await driver.getContext()
  const ctxName = typeof ctxRaw === 'string' ? ctxRaw : ((ctxRaw as { id?: string })?.id ?? 'NATIVE_APP')
  const isWebView = ctxName.startsWith('WEBVIEW_')
  const context: 'WEBVIEW' | 'NATIVE' = isWebView ? 'WEBVIEW' : 'NATIVE'
  const platform: 'android' | 'ios' = driver.isIOS ? 'ios' : 'android'

  const elements = isWebView
    ? await listWebViewElements(context, platform)
    : await listNativeElements(context, platform)

  const slice = elements.slice(0, limit)

  if (!silent) printTable(slice, ctxName)

  return slice
}

async function listWebViewElements(
  context: 'WEBVIEW' | 'NATIVE',
  platform: 'android' | 'ios',
): Promise<InteractiveElement[]> {
  const raw = await driver.execute((): WebInteractiveElement[] => {
    const INTERACTIVE_SELECTORS = [
      'a', 'button', '[role="button"]', '[role="link"]',
      '[role="menuitem"]', '[role="listitem"]', 'input', 'select', 'textarea',
      '[tabindex]', '[onclick]',
    ]

    const seen = new Set<Element>()
    const results: WebInteractiveElement[] = []

    for (const sel of INTERACTIVE_SELECTORS) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (seen.has(el)) continue
        seen.add(el)

        const tag = el.tagName.toLowerCase()
        const explicitRole = el.getAttribute('role')
        // Rôle ARIA implicite selon la spec HTML AAM.
        // <input> varie selon type, <select multiple> est listbox.
        const INPUT_TYPE_ROLES: Record<string, string> = {
          checkbox: 'checkbox', radio: 'radio', search: 'searchbox',
          number: 'spinbutton', range: 'slider',
        }
        let implicitRole: string
        if (tag === 'input') {
          implicitRole = INPUT_TYPE_ROLES[(el as HTMLInputElement).type] ?? 'textbox'
        } else if (tag === 'select') {
          implicitRole = (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox'
        } else {
          const STATIC: Record<string, string> = { a: 'link', button: 'button', textarea: 'textbox' }
          implicitRole = STATIC[tag] ?? tag
        }
        const role = explicitRole ?? implicitRole
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        const ariaLabel = el.getAttribute('aria-label') ?? ''
        const href = (el as HTMLAnchorElement).href ?? ''
        const id = el.id

        let testingLibraryQuery = ''
        if (ariaLabel) testingLibraryQuery = `getByRole('${role}', { name: /${ariaLabel}/i })`
        else if (text) testingLibraryQuery = `getByRole('${role}', { name: /${text.slice(0, 30)}/i })`
        else testingLibraryQuery = `getByRole('${role}')`

        results.push({ tag, role, text, ariaLabel, href, id, testingLibraryQuery })
      }
    }

    return results
  }) as WebInteractiveElement[]

  return raw.map((el, i) => ({
    index: i + 1,
    context,
    platform,
    role: el.role,
    label: el.ariaLabel || el.text || '(vide)',
    selectorHint: el.testingLibraryQuery,
  }))
}

async function listNativeElements(
  context: 'WEBVIEW' | 'NATIVE',
  platform: 'android' | 'ios',
): Promise<InteractiveElement[]> {
  const results: InteractiveElement[] = []

  if (platform === 'android') {
    let index = 1
    for await (const el of driver.$$('//*[@clickable="true" or @focusable="true"]')) {
      try {
        if (!(await el.isDisplayed())) continue
        const contentDesc = (await el.getAttribute('content-desc')) ?? ''
        const text = (await el.getText().catch(() => '')) ?? ''
        const label = contentDesc || text || '(vide)'
        const selectorHint = contentDesc
          ? `~${contentDesc}`
          : text
            ? `android=new UiSelector().text("${text}")`
            : `android=new UiSelector().index(${index - 1})`
        const tagName = (await el.getTagName().catch(() => null)) ?? 'unknown'
        results.push({ index, context, platform, role: tagName, label, selectorHint })
        index++
      } catch {
        // éléments stale (animation en cours) — on ignore
      }
    }
  } else {
    // iOS : XCUIElementType les plus courants dans les apps hybrides
    const xpath = [
      '//XCUIElementTypeButton',
      '//XCUIElementTypeLink',
      '//XCUIElementTypeTextField',
      '//XCUIElementTypeStaticText[@accessible="true"]',
      '//XCUIElementTypeCell',
    ].join(' | ')
    let index = 1
    for await (const el of driver.$$(xpath)) {
      try {
        if (!(await el.isDisplayed())) continue
        const name = (await el.getAttribute('name')) ?? ''
        const label = (await el.getAttribute('label')) ?? ''
        const display = name || label || '(vide)'
        const selectorHint = name ? `~${name}` : `(aucun accessibilityIdentifier — inspecter avec Appium Inspector)`
        const tagName = (await el.getTagName().catch(() => null)) ?? 'XCUIElementType'
        results.push({ index, context, platform, role: tagName.replace('XCUIElementType', ''), label: display, selectorHint })
        index++
      } catch {
        // éléments stale — on ignore
      }
    }
  }

  return results
}

function printTable(elements: InteractiveElement[], ctxName: string): void {
  if (elements.length === 0) {
    console.log(`\n⚠️  Aucun élément interactif trouvé (contexte : ${ctxName}).`)
    console.log('   → iOS : essayer await refreshAxTree() puis re-lister.')
    console.log('   → NATIVE Android : vérifier que l\'écran est en premier plan (adb input keyevent 82).\n')
    return
  }

  console.log(`\n${elements.length} élément(s) — contexte : ${ctxName}\n`)

  const COL = { n: 4, ctx: 9, role: 18, label: 46, hint: 0 }
  const header =
    'N°'.padEnd(COL.n) +
    'Ctx'.padEnd(COL.ctx) +
    'Rôle'.padEnd(COL.role) +
    'Label'.padEnd(COL.label) +
    'Locator suggéré'

  console.log(header)
  console.log('─'.repeat(140))

  for (const el of elements) {
    console.log(
      String(el.index).padEnd(COL.n) +
      el.context.padEnd(COL.ctx) +
      el.role.slice(0, COL.role - 2).padEnd(COL.role) +
      el.label.slice(0, COL.label - 2).padEnd(COL.label) +
      el.selectorHint
    )
  }
  console.log('')
}
