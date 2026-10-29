/**
 * Attend, par l'arbre d'accessibilité NATIF iOS, qu'un élément soit `present` ou `gone` ; vrai si atteint dans le délai. Sans effet hors iOS.
 * À appeler hors `inWebContext`. Ne lève pas : un arbre natif périmé ne doit pas casser le test, la suite ré-observe la page elle-même.
 */
export async function waitForNativeAx(selector: string, state: 'present' | 'gone', timeout = 8000): Promise<boolean> {
  if (!driver.isIOS) return true
  return await browser.waitUntil(async () => ((await $$(selector)).length > 0) === (state === 'present'), {timeout, interval: 250})
    .then(() => true, () => false)
}
