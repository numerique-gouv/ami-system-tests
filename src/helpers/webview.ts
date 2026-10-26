import { platform } from '../platform'
import { maskSensitiveUrl } from './session'

/**
 * Décrit l'écran courant pour enrichir les messages d'erreur (ex. échec de navigation) —
 * distingue un écran natif d'une URL de la SPA.
 * Best-effort : ne throw jamais, utilisée dans des contextes déjà en échec.
 */
export async function describeCurrentPage(): Promise<string> {
  if (!await platform().isWebContextAvailable()) {
    return 'écran natif (hors WebView)'
  }
  // Appelée depuis une WebView (l'appelant enveloppe) : pas de bascule ici.
  return await (driver.execute(() => location.href) as Promise<string>)
    .then(href => `WebView : ${maskSensitiveUrl(href)}`)
    .catch(() => 'WebView (URL illisible)')
}
