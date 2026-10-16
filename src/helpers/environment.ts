/**
 * Résolution de l'environnement cible pour la webapp — pas de picker natif pour
 * sélectionner l'environnement (contrairement au mobile, cf. EnvironmentPickerPage.reviewEnvironmentPicker),
 * donc l'URL est dérivée directement de AMI_ENV. Même logique de dérivation que
 * resolveBackendUrl() dans src/scripts/push-notification.ts, dupliquée ici volontairement plutôt
 * que factorisée avec le mobile : la source d'alimentation se dédouble sans que
 * setBackendUrl()/getBackendUrl() changent.
 */

const STAGING_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'

export interface Environment {
  /** URL de la SPA — aussi l'hôte de l'API partenaire, staging sert les deux. */
  webappUrl: string
  apiUrl: string
}

export type EnvironmentKind = 'preprod' | 'staging' | 'review'

/**
 * Nature de l'environnement visé par AMI_ENV, même règle que `backendUrlFor()` : `preprod`, `review` (review app d'une PR, AMI_ENV
 * contient un nombre) ou `staging`. Sert aux scénarios qui n'ont de sens que dans un environnement : ils se sautent avec un motif
 * visible (`this.skip()` + `log.warn`), jamais par un `if` silencieux.
 */
export function environmentKind(): EnvironmentKind {
  const env = process.env.AMI_ENV ?? ''
  if (/preprod/i.test(env)) return 'preprod'
  return /\b\d+\b/.test(env) ? 'review' : 'staging'
}

/**
 * Dérive l'environnement depuis AMI_ENV (.env.local) :
 *   - contient un nombre → review app PR (ex : "1234" → ami-back-staging-pr1234.…)
 *   - sinon               → staging (ami-back-staging.osc-fr1.scalingo.io)
 */
export function resolveEnvironment(): Environment {
  const env = process.env.AMI_ENV ?? ''
  const prMatch = env.match(/\b(\d+)\b/)
  const url = prMatch
    ? `https://ami-back-staging-pr${prMatch[1]}.osc-fr1.scalingo.io`
    : STAGING_URL
  return {webappUrl: url, apiUrl: url}
}
