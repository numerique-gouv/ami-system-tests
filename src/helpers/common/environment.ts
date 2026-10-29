const STAGING_URL = 'https://ami-back-staging.osc-fr1.scalingo.io'
const PREPROD_URL = 'https://preprod.ami.beta.numerique.gouv.fr'

export interface Environment {
  webappUrl: string
  apiUrl: string
}

export type EnvironmentKind = 'preprod' | 'staging' | 'review'

/** AMI_ENV contenant « preprod » vise la préproduction, un nombre la review app de cette PR, sinon le staging. */
export function backendUrlFor(env: string): string {
  if (/preprod/i.test(env)) return PREPROD_URL
  const prMatch = env.match(/\b(\d+)\b/)
  return prMatch ? `https://ami-back-staging-pr${prMatch[1]}.osc-fr1.scalingo.io` : STAGING_URL
}

export function environmentKind(): EnvironmentKind {
  const env = process.env.AMI_ENV ?? ''
  if (/preprod/i.test(env)) return 'preprod'
  return /\b\d+\b/.test(env) ? 'review' : 'staging'
}

export function isPreprod(): boolean {
  return environmentKind() === 'preprod'
}

export function resolveEnvironment(): Environment {
  const url = backendUrlFor(process.env.AMI_ENV ?? '')
  return {webappUrl: url, apiUrl: url}
}
