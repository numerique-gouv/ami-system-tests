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
 * Écrit `<dossier du run>/failures/<test>__<horodatage>/context.json` : test, étapes, erreur et URL (jetons masqués), plateforme,
 * appareil, backend, et pour un contexte web les identifiants Sentry. Aucun secret. Ne change jamais de contexte : sur iOS, cela peut bloquer ~25 s.
 */
export interface FailedTest {
  title: string
  fullTitle?: string
  parent?: string
}

function slugify(text: string): string {
  return text.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 80)
}

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

  try {
    if (await isWebContent()) {
      context.contextKind = 'web'
      context.url = maskSensitiveUrl(await browser.getUrl())
      const ids = await readSentryIds().catch(() => null)
      context.sentry = ids && {...ids, url: sentryTraceUrl(ids.traceId)}
    } else {
      context.contextKind = 'native'
    }
  } catch {
    // contexte perdu ou session fermée : le dump ne doit pas masquer l'échec du test
  }

  fs.writeFileSync(path.join(dir, 'context.json'), JSON.stringify(context, null, 2))
  log.info(`failure-dump : ${path.relative(process.cwd(), dir)}`)
}
