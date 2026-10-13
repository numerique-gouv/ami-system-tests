/**
 * Sélecteur WDIO 10 `role/<rôle>[name="<nom accessible>"]` (WebView et webapp ; refusé en contexte natif).
 * Le nom est comparé EXACTEMENT, tel que WDIO le calcule : sans le texte des icônes `aria-hidden`
 * (« Vacances de la Toussaint », pas « … 🍁 »), apostrophes typographiques comprises — à copier du DOM.
 * Pour un nom partiel, utiliser plutôt `button*=Texte` (texte visible contient).
 */
export function roleSelector(role: string, name?: string): string {
  if (name === undefined) return `role/${role}`
  return `role/${role}[name="${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}
