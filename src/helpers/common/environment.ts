/**
 * Résolution de l'environnement cible pour la webapp — pas de picker natif pour
 * sélectionner l'environnement (contrairement au mobile, cf. EnvironmentPickerPage.reviewEnvironmentPicker),
 * donc l'URL est dérivée directement de AMI_ENV. Cette dérivation est volontairement
 * séparée de celle du mobile : la source d'alimentation se dédouble sans que
 * setBackendUrl()/getBackendUrl() changent.
 */

const STAGING_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'
const PREPROD_URL = 'https://preprod.ami.beta.numerique.gouv.fr'

export interface Environment {
  /** URL de la SPA — aussi l'hôte de l'API partenaire, staging et préprod servent les deux. */
  webappUrl: string
  apiUrl: string
}

/**
 * Dérive l'URL backend (SPA + API événements/consentement) depuis une valeur d'AMI_ENV :
 *   - contient « preprod » (insensible à la casse) → préproduction (preprod.ami.beta.numerique.gouv.fr)
 *   - contient un nombre                           → review app PR (ex : "1234" → ami-back-staging-pr1234.…)
 *   - sinon                                        → staging (ami-back-staging.osc-fr1.scalingo.io)
 * Source unique : webapp, picker mobile, scripts et CI s'appuient dessus.
 */
export function backendUrlFor(env: string): string {
  if (/preprod/i.test(env)) return PREPROD_URL
  const prMatch = env.match(/\b(\d+)\b/)
  return prMatch ? `https://ami-back-staging-pr${prMatch[1]}.osc-fr1.scalingo.io` : STAGING_URL
}

/**
 * AMI_ENV vise-t-il la préprod ? Choisit aussi le build mobile à installer (flavor Android `preprod`,
 * schéma iOS `AMI-Preproduction`) : voir src/driver/capabilities.ts et les variables du justfile.
 */
export function isPreprod(): boolean {
  return /preprod/i.test(process.env.AMI_ENV ?? '')
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

/** Dérive l'environnement depuis AMI_ENV (.env), cf. backendUrlFor(). */
export function resolveEnvironment(): Environment {
  const url = backendUrlFor(process.env.AMI_ENV ?? '')
  return {webappUrl: url, apiUrl: url}
}
