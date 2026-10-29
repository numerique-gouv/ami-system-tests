import {platform} from '../../platform'
import {getBackendUrl} from '../partner-api'
import {isBackendPageOutsideSpa} from './first-screen'

/** Cookie de session du backend : HttpOnly, donc lisible par WebDriver (`browser.getCookies`) et pas par `document.cookie`. */
const SESSION_COOKIE_NAME = 'token'

const SENSITIVE_QUERY_PARAMS = /([?&](?:id_token|id_token_hint|token|access_token|user_data)=)[^&#]*/g

/** Masque les jetons d'une URL avant de l'écrire dans un log ou un message d'erreur. */
export function maskSensitiveUrl(url: string): string {
  return url.replace(SENSITIVE_QUERY_PARAMS, '$1***')
}

/** Le cookie n'est lisible que depuis l'origine du backend : ailleurs (écran natif, FranceConnect), `false` veut dire « inconnu ». */
export async function hasSessionToken(): Promise<boolean> {
  if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return false
  try {
    return await platform().inWebContext(async () => {
      if (new URL(await browser.getUrl()).origin !== new URL(getBackendUrl()).origin) return false
      return (await browser.getCookies({name: SESSION_COOKIE_NAME})).length > 0
    })
  } catch {
    return false
  }
}

/** Charge la racine de l'app : la SPA route elle-même vers l'accueil ou la connexion. */
export async function openAppRoot(): Promise<void> {
  await platform().inWebContext(async () => {
    await browser.url(platform().kind === 'webapp' ? '/' : `${new URL(getBackendUrl()).origin}/`)
  })
}

/** Remplace la page courante par la racine de l'app : un retour arrière ne ramène pas à la page quittée. La session est conservée. */
export async function replaceWithAppRoot(): Promise<void> {
  await platform().inWebContext(async () => {
    await driver.execute((root: string) => { window.location.replace(root) }, platform().kind === 'webapp' ? '/' : `${new URL(getBackendUrl()).origin}/`)
  })
}

/** URL courante de la WebView, jetons masqués ; ne lève jamais, pour pouvoir figurer dans un message d'erreur. */
export async function currentUrlForLog(): Promise<string> {
  if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return 'écran natif (hors WebView)'
  return await platform().inWebContext(async () => maskSensitiveUrl(await browser.getUrl()))
    .catch(() => 'URL illisible')
}

/** La WebView affiche-t-elle une page serveur du backend hors de la SPA ? Faux hors WebView. */
export async function isOnBackendPageOutsideSpa(): Promise<boolean> {
  if (platform().kind !== 'webapp' && !await platform().isWebContextAvailable()) return false
  return await platform().inWebContext(async () => isBackendPageOutsideSpa(await browser.getUrl(), getBackendUrl()))
    .catch(() => false)
}
