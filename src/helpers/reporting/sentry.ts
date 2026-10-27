/**
 * Identifiants Sentry lisibles dans la page (SPA, `@sentry/sveltekit`) : de quoi retrouver l'erreur côté Sentry depuis un test en échec.
 *
 * Vérifié le 2026-10-08 sur la SPA de staging (SDK 10.72.0) : le SDK publie `window.__SENTRY__[<version>]` avec
 * `defaultCurrentScope.getPropagationContext().traceId` et `defaultIsolationScope.lastEventId()`.
 * - le trace id change à chaque chargement de page ; il n'y a pas de span id dans ce contexte ;
 * - `lastEventId()` vaut `null` tant qu'aucune erreur n'a été capturée ; son comportement après une vraie erreur n'est pas
 *   vérifié (on n'envoie pas d'événement de sonde à Sentry).
 * La version du SDK se découvre, elle n'est pas codée en dur. Les apps natives n'ont pas d'intégration Sentry : si elles en
 * ont une un jour, il faudra capturer aussi leurs identifiants.
 *
 * À appeler dans un contexte web déjà actif (webapp, ou WebView courante) : ne change jamais de contexte.
 */
export interface SentryIds {
  sdkVersion: string | null
  traceId: string | null
  lastEventId: string | null
  environment: string | null
}

/** Page « Traces » du Sentry de l'équipe (instance incubateur, organisation betagouv). */
const SENTRY_TRACES_URL = 'https://sentry.incubateur.net/organizations/betagouv/explore/traces/trace/'
// Environnements Sentry du filtre : ceux observés (Staging-front, Staging-new…) ou déjà codés ici. Les review apps de PR n'y figurent PAS : leur valeur
// (`SENTRY_ENV` côté API, `PUBLIC_FRONT_SENTRY_ENV` côté SPA) n'est pas dans le dépôt ami-notifications-api (`.env` les laisse vides, scalingo.json
// ne les définit pas : elles sont posées dans la configuration Scalingo). Non confirmé : ne pas en inventer une ; la trace d'une review app peut donc
// être masquée par ce filtre tant que l'équipe n'a pas communiqué le nom réel (le champ `environment` du dump `context.json` le donne dès qu'un test web échoue sur une review app).
const SENTRY_TRACES_URL_POSTFIX = '/?environment=Preprod-new&environment=Preprod-front&environment=Prod-new&environment=Staging-front&environment=Staging-new'
/** Lien Sentry vers la recherche de la trace (`trace:<id>`, vue tableau), ou `null` si l'identifiant est inconnu. */
export function sentryTraceUrl(traceId: string | null): string | null {
  return traceId ? `${SENTRY_TRACES_URL}${traceId}${SENTRY_TRACES_URL_POSTFIX}` : null
}

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
