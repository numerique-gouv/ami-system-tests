import fs from 'fs'
import path from 'path'
import logger from '@wdio/logger'
import {platform} from '../../platform'
import {currentSteps} from './report'
import {readSentryIds, sentryTraceUrl} from './sentry'
import {maskSensitiveUrl} from '../common/session'
import {getBackendUrl} from '../partner-api'

const log = logger('config')

/**
 * Contexte d'un test en échec, dans `<dossier du run>/failures/<test>__<horodatage>/context.json` (publié en artefact de CI ; dossier du run =
 * `test-results/traces/<horodatage>_<plateforme>_<suite ou spec>/`, cf. `traceRootDir` dans wdio.base.conf.ts) :
 * test, étapes `step()`, erreur (jetons masqués), plateforme, appareil, backend, URL (jetons masqués), horodatage UTC, et pour un
 * contexte web les identifiants Sentry de la SPA avec le lien vers la trace.
 * Les captures, le DOM ou l'arbre natif, les éléments interactifs et le réseau ne sont plus écrits ici : le service DevTools
 * (mode trace, cf. `traceServices` dans wdio.base.conf.ts) les enregistre dans `test-results/` (cf. `devtools-artifacts-*.json`).
 * Ne change jamais de contexte : sur iOS, un changement de contexte au milieu d'un échec peut bloquer ~25 s.
 * Aucune valeur secrète (clés, mots de passe) n'est écrite.
 */
export interface FailedTest {
  title: string
  fullTitle?: string
  parent?: string
}

function slugify(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 80)
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
  const failuresRoot = process.env.WDIO_RUN_DIR ? path.join(process.env.WDIO_RUN_DIR, 'failures') : path.resolve(process.cwd(), 'test-results/failures')
  const dir = path.join(failuresRoot, `${slugify(test.title)}__${failedAt.toISOString().replace(/[:.]/g, '-')}`)
  fs.mkdirSync(dir, {recursive: true})

  const context: Record<string, unknown> = {
    test: test.fullTitle ?? test.title,
    suite: test.parent ?? null,
    failedAtUtc: failedAt.toISOString(),
    platform: platform().kind,
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

  // Selon le contexte courant, sans changement de contexte (évite le blocage iOS ~25 s).
  try {
    if (await isWebContent()) {
      context.contextKind = 'web'
      context.url = maskSensitiveUrl(await browser.getUrl())
      const ids = await readSentryIds().catch((err: unknown) => {
        log.warn('failure-dump : identifiants Sentry illisibles', err)
        return null
      })
      context.sentry = ids && {...ids, url: sentryTraceUrl(ids.traceId)}
    } else {
      context.contextKind = 'native'
    }
  } catch (err) {
    log.warn('failure-dump : contexte illisible (contexte perdu ou session fermée ?)', err)
  }

  fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(context, null, 2))
  const sentryUrl = (context.sentry as {url?: string | null} | null | undefined)?.url
  log.info(`failure-dump : ${path.relative(process.cwd(), dir)}${sentryUrl ? ` · sentry ${sentryUrl}` : ''}`)
}
