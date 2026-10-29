/** Sélecteur WDIO 10 `role/<rôle>[name="<nom accessible>"]` (WebView et webapp). Le nom est comparé exactement ; pour un nom partiel, `button*=Texte`. */
export function roleSelector(role: string, name?: string): string {
  if (name === undefined) return `role/${role}`
  return `role/${role}[name="${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
}
