import { createHash } from 'node:crypto'

/** Données pivot FranceConnect brutes, comme renvoyées par le userinfo FC (`family_name` est le nom de naissance). */
export interface FcPivotData {
  given_name: string
  family_name: string
  birthdate: string
  gender: string
  birthplace: string
  birthcountry: string
}

/** Reproduit `build_fc_hash` v2 de ami-notifications-api (ami/user/utils.py). */
export function computeFcHash(data: FcPivotData): string {
  const parts = [
    data.given_name,
    data.family_name,
    data.birthdate,
    data.gender,
    data.birthplace,
    data.birthcountry,
  ]
  return createHash('sha256').update(parts.join(';')).digest('hex')
}
