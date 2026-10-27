/**
 * SQUELETTE (skill creating-test-structure, 2026-10-15) — rien n'est implémenté : aucun locator ni Page Object n'existe encore.
 * Route couverte : `/#/preferences/zones/city` (« Rechercher une commune »), déployée sur staging le 2026-10-15
 * (références : references/website-analysis/…/website-analysis.md § « Recherche d'une commune »).
 *
 * Pour implémenter : observer d'abord la page (`just explore-webapp "/#/preferences/zones/city"` puis `just s webapp snapshot -i`),
 * ranger les sélecteurs dans `src/pages/locators/zones.locators.ts`, les actions dans `ZonesPage` / un `ZonesCityPage`
 * (CONTRIBUTING §1, §2), puis retirer les `it.skip`.
 * Lecture seule : ne jamais choisir une commune ni modifier les zones du compte de test partagé.
 */
describe('Zones scolaires › recherche d\'une commune', () => {
  before(async function () {
    this.timeout(180000)
    // getAppToStartingState() — connexion si besoin (cf. src/tests/webapp/agenda.parcours.test.ts)
  })

  beforeEach(async function () {
    this.timeout(180000)
    // getAppToStartingState() puis ouvrir la page des zones (PreferencesPage.open() → PreferencesPage.openZones())
    // ZonesPage.assertDisplayed()
  })

  // CONFIRMÉ en live le 2026-10-15 : « Ajouter des communes » → `#/preferences/zones/city`, h1 « Rechercher une commune »,
  // seul bouton « Retour à la page précédente », qui ramène à `#/preferences/zones`.
  it.skip('« Ajouter des communes » ouvre la recherche d\'une commune, puis « Retour » revient aux zones', async () => {
    // ZonesPage.openAddCities()            — clic sur « Ajouter des communes » ; ne connaît pas la page suivante (CONTRIBUTING §3)
    // ZonesCityPage.assertDisplayed()      — titre « Rechercher une commune » + champ de recherche
    // ZonesCityPage.back()                 — « Retour à la page précédente »
    // ZonesPage.assertDisplayed()          — on retrouve les 13 zones scolaires
  })

  // NON CONFIRMÉ : autocomplétion et alerte « Récupération de la commune indisponible » vues dans le code `origin/main`
  // seulement (aucune saisie faite en live). À observer avant d'écrire : un backend d'adresses (BAN) tiers est probablement
  // en jeu — hypothèse, à vérifier avec `just s webapp requests`.
  it.skip('la saisie d\'un nom de commune propose des suggestions (sans en choisir)', async () => {
    // ZonesCityPage.search('Rennes')       — saisie dans le champ ; ne PAS sélectionner de suggestion (cela modifierait les zones)
    // ZonesCityPage.assertSuggestionsShown() — au moins une suggestion affichée (waitUntil + timeoutMsg, CONTRIBUTING §5)
  })
})
