/**
 * Type partagé par tous les fichiers locators — un sélecteur WDIO est toujours une chaîne
 * (CSS, `~accessibilityId`, `android=UiSelector(...)`, `-ios predicate string:...`, etc.).
 *
 * Anciennement défini dans onboarding.locators.ts (supprimé le 2026-09-08 : ses sélecteurs
 * concrets — resource-id spéculatifs jamais validés en live — n'étaient importés nulle part ;
 * seul ce type était réellement utilisé par les autres fichiers locators).
 */
export type Locator = string
