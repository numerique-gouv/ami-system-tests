/**
 * WDIO 10 : `$()` lève une `StrictSelectorError` (« strict mode violation ») quand le sélecteur désigne plusieurs
 * éléments. Une sonde qui avale toutes les erreurs (`.catch(() => false)`) la prend pour « élément absent » :
 * sur Android, le sélecteur d'environnement à deux textes « Staging » a ainsi fait échouer 21 tests sans un mot.
 * À appeler en tête du `catch` d'une sonde : la violation remonte, toute autre erreur reste « absent ».
 */
export function rethrowStrictViolation(err: unknown): void {
  if (err instanceof Error && /strict mode violation/i.test(err.message)) throw err
}
