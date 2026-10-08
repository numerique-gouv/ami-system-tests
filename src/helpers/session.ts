import {platform} from '../platform'
import {getBackendUrl} from './notifications-api'
import logger from '@wdio/logger'

const log = logger('helper')

/**
 * Cookie de session posé par le backend au callback de connexion (mesuré le 2026-10-08 sur iOS : `token`,
 * HttpOnly, Secure, SameSite=Lax, cookie de session). HttpOnly : invisible pour `document.cookie`, lisible
 * par le protocole WebDriver (`browser.getCookies`). Son existence dit « une session a été ouverte » ; sa
 * validité côté serveur, seule la SPA la révèle (« Bonjour » ou écran de connexion).
 * Non vérifié sur Android.
 */
const SESSION_COOKIE_NAME = 'token'

const SENSITIVE_QUERY_PARAMS = /([?&](?:id_token|id_token_hint|token|access_token)=)[^&#]*/g

/** Masque les jetons d'une URL avant de l'écrire dans un log ou un message d'erreur. */
export function maskSensitiveUrl(url: string): string {
  return url.replace(SENSITIVE_QUERY_PARAMS, '$1***')
}

/**
 * Une session est-elle ouverte ? Le cookie n'est lisible que depuis l'origine du backend : sur un écran natif
 * (sélecteur d'environnement, bouton FranceConnect natif) ou sur une page d'un autre domaine (FranceConnect,
 * partenaire), la réponse est `false` — « inconnu », pas « déconnecté » : l'appelant observe alors la page.
 */
export async function hasSessionToken(): Promise<boolean> {
  if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return false
  try {
    return await platform().inWebContext(async () => {
      const origin = new URL(await browser.getUrl()).origin
      if (origin !== new URL(getBackendUrl()).origin) {
        log.info(`hasSessionToken: page hors du backend (${origin}), cookie de session illisible`)
        return false
      }
      return (await browser.getCookies({name: SESSION_COOKIE_NAME})).length > 0
    })
  } catch (err) {
    log.warn('hasSessionToken: lecture du cookie de session impossible', err)
    return false
  }
}

/** Charge la racine de l'app (chargement complet : la SPA route elle-même vers l'accueil ou la connexion). */
export async function openAppRoot(): Promise<void> {
  await platform().inWebContext(async () => {
    await browser.url(platform().kind === 'webapp' ? '/' : `${new URL(getBackendUrl()).origin}/`)
  })
}

/** URL courante de la WebView, jetons masqués ; « écran natif » hors WebView. Ne lève jamais. */
export async function currentUrlForLog(): Promise<string> {
  if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return 'écran natif (hors WebView)'
  return await platform().inWebContext(async () => maskSensitiveUrl(await browser.getUrl()))
    .catch(() => 'URL illisible')
}
