import { platform } from '../platform'

/**
 * Décrit l'écran courant pour enrichir les messages d'erreur (ex. échec de navigation) —
 * distingue un écran natif d'une URL de la SPA.
 * Best-effort : ne throw jamais, utilisée dans des contextes déjà en échec.
 */
export async function describeCurrentPage(): Promise<string> {
  if (!await platform().isWebContextAvailable()) {
    return 'écran natif (hors WebView)'
  }
  return await platform().inWebContext(() =>
    driver.execute(() => location.href) as Promise<string>
  )
    .then(href => `WebView : ${href}`)
    .catch(() => 'WebView (URL illisible)')
}
