import fs from 'fs'
import path from 'path'
import logger from '@wdio/logger'
import {maskSensitiveUrl} from '../session'

const log = logger('config')

/**
 * Masquage des traces du service DevTools (`@wdio/devtools-service`, mode trace) avant leur publication en artefact : le
 * service n'a aucune option pour filtrer le réseau et enregistre tels quels les en-têtes `cookie` / `set-cookie` (donc le
 * cookie `access_key` de la webapp de staging et les cookies de session) et les paramètres des URL (`code`, `state`…).
 * Le contenu des réponses n'est pas enregistré (taille et type seulement), les corps des requêtes non plus.
 * Appelé en fin de run (`onComplete`), une fois les traces écrites par les workers.
 */
const MASK = '[masqué]'
const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-api-key'])
const SENSITIVE_PARAMS = /^(id_token|id_token_hint|token|access_token|code|state|nonce|access_key)$/i
const SENSITIVE_URL_PARAMS = /([?&](?:code|state|nonce|access_key)=)[^&#]*/g

/** Variables d'environnement dont la valeur ne doit apparaître dans aucun fichier de trace. */
const SECRET_ENV_VARS = ['WEB_APP_ACCESS_KEYS', 'NOTIF_PARTNER_SECRET']

interface NameValue { name?: string, value?: string }

function maskUrl(url: string): string {
  return maskSensitiveUrl(url).replace(SENSITIVE_URL_PARAMS, '$1***')
}

function maskPairs(pairs: NameValue[] | undefined, isSensitive: (name: string) => boolean): void {
  for (const pair of pairs ?? []) {
    if (pair.name && isSensitive(pair.name)) pair.value = MASK
  }
}

function maskMessage(message: {url?: string, redirectURL?: string, headers?: NameValue[], cookies?: NameValue[], queryString?: NameValue[]}): void {
  if (message.url) message.url = maskUrl(message.url)
  if (message.redirectURL) message.redirectURL = maskUrl(message.redirectURL)
  maskPairs(message.headers, name => SENSITIVE_HEADERS.has(name.toLowerCase()))
  for (const cookie of message.cookies ?? []) cookie.value = MASK
  maskPairs(message.queryString, name => SENSITIVE_PARAMS.test(name))
}

/** Masque une ligne de `trace.network` (une entrée HAR par ligne) ; renvoie la ligne telle quelle si elle n'est pas du JSON. */
export function redactNetworkLine(line: string): string {
  try {
    const entry = JSON.parse(line) as {snapshot?: {request?: object, response?: object}}
    if (entry.snapshot?.request) maskMessage(entry.snapshot.request)
    if (entry.snapshot?.response) maskMessage(entry.snapshot.response)
    return JSON.stringify(entry)
  } catch {
    return line
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

/** Masque `trace.network` et efface les secrets de l'environnement dans tous les fichiers texte des traces de `root`. */
export function redactTraces(root = path.resolve(process.cwd(), 'test-results')): number {
  if (!fs.existsSync(root)) return 0
  const secrets = SECRET_ENV_VARS.map(name => process.env[name]).filter((value): value is string => !!value)
  let redacted = 0
  for (const file of walk(root)) {
    // Dossier de trace : `trace-<spec>-…` (une trace par spec) ou `<spec>_test-…/trace` (une trace par test).
    const inTrace = path.relative(root, file).split(path.sep).slice(0, -1).some(dir => dir === 'trace' || dir.startsWith('trace-'))
    if (!inTrace) continue
    const base = path.basename(file)
    if (base !== 'trace.network' && !/\.(json|txt|md|trace|mutations)$/.test(base)) continue
    const original = fs.readFileSync(file, 'utf8')
    let text = base === 'trace.network' ? original.split('\n').map(redactNetworkLine).join('\n') : original
    for (const secret of secrets) text = text.split(secret).join(MASK)
    if (text !== original) {
      fs.writeFileSync(file, text)
      redacted++
    }
  }
  if (redacted > 0) log.info(`trace-redact : ${redacted} fichier(s) de trace masqué(s)`)
  return redacted
}
