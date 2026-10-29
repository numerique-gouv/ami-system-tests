export interface SentryIds {
  sdkVersion: string | null
  traceId: string | null
  lastEventId: string | null
  environment: string | null
}

const SENTRY_TRACES_URL = 'https://sentry.incubateur.net/organizations/betagouv/explore/traces/trace/'
// Le nom de l'environnement Sentry des review apps de PR est inconnu : leurs traces peuvent être masquées par ce filtre.
const SENTRY_TRACES_URL_POSTFIX = '/?environment=Preprod-new&environment=Preprod-front&environment=Prod-new&environment=Staging-front&environment=Staging-new'
export function sentryTraceUrl(traceId: string | null): string | null {
  return traceId ? `${SENTRY_TRACES_URL}${traceId}${SENTRY_TRACES_URL_POSTFIX}` : null
}

/** Lit les identifiants du SDK Sentry de la SPA ; à appeler dans un contexte web déjà actif. */
export async function readSentryIds(): Promise<SentryIds | null> {
  return await browser.execute((): SentryIds | null => {
    const carrier = (window as unknown as {__SENTRY__?: Record<string, unknown>}).__SENTRY__
    if (!carrier) return null
    const sdkVersion = Object.keys(carrier).find(key => /^\d+\.\d+/.test(key)) ?? null
    const sdk = sdkVersion ? carrier[sdkVersion] as {
      defaultCurrentScope?: {getPropagationContext?: () => {traceId?: string}, getClient?: () => {getOptions?: () => {environment?: string}} | undefined}
      defaultIsolationScope?: {lastEventId?: () => string | undefined}
    } | undefined : undefined
    return {
      sdkVersion,
      traceId: sdk?.defaultCurrentScope?.getPropagationContext?.().traceId ?? null,
      lastEventId: sdk?.defaultIsolationScope?.lastEventId?.() ?? null,
      environment: sdk?.defaultCurrentScope?.getClient?.()?.getOptions?.().environment ?? null,
    }
  })
}
