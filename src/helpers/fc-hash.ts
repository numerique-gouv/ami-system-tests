import { createHash } from 'node:crypto'

/**
 * Données pivot FranceConnect, telles que renvoyées par le userinfo FC
 * (et par la colonne du même nom de la maquette FC). Aucune normalisation :
 * `family_name` est le nom de NAISSANCE (pas `preferred_username`),
 * `birthplace` est vide pour une naissance à l'étranger.
 */
export interface FcPivotData {
  given_name: string
  family_name: string
  birthdate: string
  gender: string
  birthplace: string
  birthcountry: string
}

/**
 * Reproduit `build_fc_hash` de ami-notifications-api (ami/user/utils.py:6-23).
 * v1 (défaut) : SHA-256 hex de la concaténation SANS séparateur.
 * v2 (FEATURE_FLAG_USE_FC_HASH_V2) : même chose avec « ; » entre les champs.
 */
export function computeFcHash(data: FcPivotData, version: 1 | 2 = 1): string {
  const parts = [
    data.given_name,
    data.family_name,
    data.birthdate,
    data.gender,
    data.birthplace,
    data.birthcountry,
  ]
  return createHash('sha256').update(parts.join(version === 2 ? ';' : '')).digest('hex')
}
