/**
 * Résolution de l'environnement cible pour la webapp — pas de picker natif pour
 * sélectionner l'environnement (contrairement au mobile, cf. EnvironmentPickerPage.reviewEnvironmentPicker),
 * donc l'URL est dérivée directement de AMI_ENV. Même logique de dérivation que
 * push-notification.ts:resolveBackendUrl(), dupliquée ici volontairement plutôt que d'être
 * factorisée avec le mobile — cf. plan §3, la source d'alimentation se dédouble sans que
 * setBackendUrl()/getBackendUrl() changent.
 */

const STAGING_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'

export interface Environment {
  /** URL de la SPA — aussi l'hôte de l'API partenaire, staging sert les deux. */
  webappUrl: string
  apiUrl: string
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
  return { webappUrl: url, apiUrl: url }
}
