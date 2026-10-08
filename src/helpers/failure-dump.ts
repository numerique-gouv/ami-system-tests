import fs from 'fs'
import path from 'path'
import logger from '@wdio/logger'
import {platform} from '../platform'
import {currentSteps} from './report'
import {readSentryIds} from './sentry'
import {maskSensitiveUrl} from './session'
import {getBackendUrl} from './notifications-api'

const log = logger('config')

/**
 * Dump systématique d'un test en échec, dans `test-results/failures/<test>__<horodatage>/` (publié en artefact de CI) :
 * - `context.json` : test, étapes, erreur, plateforme, appareil, backend, URL (jetons masqués), horodatage UTC, identifiants
 *   Sentry de la SPA quand le contexte courant est web ;
 * - `screenshot.png` ;
 * - `dom.html` (contexte web) ou `native-source.xml` (contexte natif) ;
 * - `interactive.txt` : éléments interactifs avec le sélecteur du projet à utiliser (`findRole(…)`, `~'…'`).
 * Ne change jamais de contexte : sur iOS, un changement de contexte au milieu d'un échec peut bloquer ~25 s.
 * Aucune valeur secrète (clés, mots de passe) n'est écrite.
 */
export interface FailedTest {
  title: string
  fullTitle?: string
  parent?: string
}

const WEB_INTERACTIVE_SELECTOR = [
  'button:not([disabled])', 'a[href]',
  'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])',
  '[role="button"]', '[role="link"]', '[role="menuitem"]',
  '[role="tab"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
].join(', ')

function slugify(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 80)
}

/** Éléments interactifs de la page, avec la requête du projet (spa.ts) qui les cible. */
async function listWebInteractive(): Promise<string[]> {
  return await browser.execute((selector: string): string[] => {
    const seen = new Set<string>()
    const result: string[] = []
    document.querySelectorAll(selector).forEach((el) => {
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute('role') ?? ''
      const ariaLabel = el.getAttribute('aria-label') ?? ''
      const text = ((el as HTMLElement).textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
      const placeholder = (el as HTMLInputElement).placeholder ?? ''
      const inputType = (el as HTMLInputElement).type ?? ''
      const n = ariaLabel || text || placeholder
      let s = ''
      if (tag === 'button' || role === 'button') {
        s = n ? `findRole('button', '${n}')` : "findRole('button')"
      } else if (tag === 'a' || role === 'link') {
        s = n ? `findRole('link', '${n}')` : "findRole('link')"
      } else if (tag === 'input') {
        if (inputType === 'checkbox' || role === 'checkbox') s = n ? `findRole('checkbox', '${n}')` : "findRole('checkbox')"
        else if (inputType === 'radio' || role === 'radio') s = n ? `findRole('radio', '${n}')` : "findRole('radio')"
        else if (placeholder) s = `findLabel('${placeholder}')`
        else s = n ? `findRole('textbox', '${n}')` : "findRole('textbox')"
      } else if (tag === 'select') {
        s = n ? `findRole('combobox', '${n}')` : "findRole('combobox')"
      } else if (tag === 'textarea') {
        s = n ? `findRole('textbox', '${n}')` : "findRole('textbox')"
      } else if (role) {
        s = n ? `findRole('${role}', '${n}')` : `findRole('${role}')`
      } else if (n) {
        s = `findText('${n}')`
      }
      if (s && !seen.has(s)) { seen.add(s); result.push(s) }
    })
    return result.slice(0, 40)
  }, WEB_INTERACTIVE_SELECTOR) as string[]
}

/** Éléments interactifs de l'arbre natif (XML Appium). */
function listNativeInteractive(xml: string): string[] {
  const lines: string[] = []
  if (browser.isIOS) {
    const INTERACTIVE = new Set([
      'XCUIElementTypeButton', 'XCUIElementTypeTextField',
      'XCUIElementTypeSecureTextField', 'XCUIElementTypeSwitch',
      'XCUIElementTypeLink', 'XCUIElementTypeCell',
    ])
    for (const m of xml.matchAll(/<(\w+)\s([^>]*?)\/?>/g)) {
      const [, type, attrs] = m
      if (!INTERACTIVE.has(type)) continue
      const accId = attrs.match(/\bname="([^"]+)"/)?.[1] ?? ''
      const label = attrs.match(/\blabel="([^"]+)"/)?.[1] ?? ''
      const roleHint = type.replace('XCUIElementType', '')
      const line = accId
        ? `~'${accId}'${label && label !== accId ? `  ("${label}")` : ''}  [${roleHint}]`
        : label ? `findText('${label}')  [${roleHint}]` : null
      if (line) lines.push(line)
    }
  } else {
    for (const m of xml.matchAll(/<\w[^>]*clickable="true"[^>]*>/g)) {
      const tag = m[0]
      const desc = tag.match(/content-desc="([^"]+)"/)?.[1] ?? ''
      const text = tag.match(/\btext="([^"]+)"/)?.[1] ?? ''
      const resourceId = tag.match(/resource-id="([^"]+)"/)?.[1] ?? ''
      const display = desc || text
      const idSuffix = resourceId.split('/').pop() ?? ''
      const line = display
        ? `~'${display}'${idSuffix ? `  (id: ${idSuffix})` : ''}`
        : resourceId ? `id('${resourceId}')` : null
      if (line) lines.push(line)
    }
  }
  return [...new Set(lines)].slice(0, 40)
}

/** Le contexte courant est-il web (webapp, ou WebView déjà active) ? Ne change pas de contexte. */
async function isWebContent(): Promise<boolean> {
  if (platform().kind === 'webapp') return true
  const ctx = await browser.getContext()
  const ctxName = typeof ctx === 'string' ? ctx : ((ctx as {id?: string})?.id ?? '')
  return ctxName.startsWith('WEBVIEW')
}

export async function dumpFailure(test: FailedTest, error?: Error): Promise<void> {
  const failedAt = new Date()
  const dir = path.resolve(process.cwd(), 'test-results/failures', `${slugify(test.title)}__${failedAt.toISOString().replace(/[:.]/g, '-')}`)
  fs.mkdirSync(dir, {recursive: true})

  const context: Record<string, unknown> = {
    test: test.fullTitle ?? test.title,
    suite: test.parent ?? null,
    failedAtUtc: failedAt.toISOString(),
    platform: platform().kind,
    runOldDevice: process.env.RUN_OLD_DEVICE === undefined ? null : process.env.RUN_OLD_DEVICE === 'true',
    device: {
      platformName: browser.capabilities?.platformName ?? null,
      deviceName: (browser.capabilities as Record<string, unknown> | undefined)?.['appium:deviceName'] ?? null,
      platformVersion: (browser.capabilities as Record<string, unknown> | undefined)?.['appium:platformVersion'] ?? null,
      browserVersion: (browser.capabilities as Record<string, unknown> | undefined)?.browserVersion ?? null,
    },
    backend: new URL(getBackendUrl()).host,
    steps: currentSteps(),
    error: error ? {name: error.name, message: maskSensitiveUrl(String(error.message)).slice(0, 2000)} : null,
  }

  try {
    const png = await browser.takeScreenshot()
    fs.writeFileSync(path.join(dir, 'screenshot.png'), Buffer.from(png, 'base64'))
  } catch (err) {
    log.warn('failure-dump : capture d\'écran impossible (session fermée ?)', err)
  }

  // Captures de débogage selon le contexte courant, sans changement de contexte (évite le blocage iOS ~25 s).
  try {
    if (await isWebContent()) {
      context.contextKind = 'web'
      context.url = maskSensitiveUrl(await browser.getUrl())
      fs.writeFileSync(path.join(dir, 'dom.html'), await browser.getPageSource())
      const interactive = await listWebInteractive()
      if (interactive.length > 0) fs.writeFileSync(path.join(dir, 'interactive.txt'), interactive.join('\n'))
      context.sentry = await readSentryIds().catch((err: unknown) => {
        log.warn('failure-dump : identifiants Sentry illisibles', err)
        return null
      })
    } else {
      context.contextKind = 'native'
      const xml = await browser.getPageSource()
      fs.writeFileSync(path.join(dir, 'native-source.xml'), xml)
      const interactive = listNativeInteractive(xml)
      if (interactive.length > 0) fs.writeFileSync(path.join(dir, 'interactive.txt'), interactive.join('\n'))
    }
  } catch (err) {
    log.warn('failure-dump : capture de débogage impossible (contexte perdu ou session fermée ?)', err)
  }

  fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(context, null, 2))
  log.info(`failure-dump : ${path.relative(process.cwd(), dir)}${context.sentry ? ` · sentry ${JSON.stringify(context.sentry)}` : ''}`)
}
