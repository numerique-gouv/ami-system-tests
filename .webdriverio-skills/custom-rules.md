# Règles d'équipe — ami-system-tests

_Template initial généré par `managing-project-customizations` le 2026-09-08. À maintenir par l'équipe._

## Sélecteurs

- Préférer les sélecteurs stables DOM/accessibilité (`role/…`, `tag*=texte`, `aria/…`, `[data-testid]`, cf. `src/helpers/spa/selectors.ts` et `spa.ts`) plutôt que des valeurs codées en dur (ex. éviter `/suivi` en dur ou la traversée arbitraire de `parentElement`).
- Inspecter le HTML réellement rendu (`just explore-<cible>` puis `just s <cible> snapshot -i`) avant de choisir une stratégie de sélecteur.
- Cf. `CONTRIBUTING.md §2` et l'ADR `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md` pour le raisonnement complet.

## Conventions de nommage/structure

- Page Objects (`*.page.ts`) ne contiennent aucun sélecteur — ils appellent `getXxxLocators()` à chaque méthode.
- Singletons exportés via `traced(new XxxPage(), 'XxxPage')`.
- `$(loc).method()` direct, jamais `(await $(loc)).method()`.
- `await` uniquement devant `expect(wdioElement)` ou une Promise — jamais devant `expect(string|boolean|number)`.

## Garde-fous obligatoires

- Les cibles `just` sont **pour les humains** (CLAUDE.md) : un agent peut appeler directement `npm`, `npx wdio …`, `adb`, `xcrun`… — il n'y a plus d'obligation de passer par `just`. Toute commande directe devenue utile aux humains s'ajoute au `justfile`, documentée. Les skills du pack tiers (ex. `running-webdriverio-tests`) prescrivent `npx wdio` : la table de `project-context.md` § Correspondance donne l'équivalent `just` (config `wdio.*.conf.ts` à choisir, suites dans `test-suites.ts`).
- Jamais de `browser.pause()` comme mécanisme de synchronisation — utiliser `waitUntil`/`waitForDisplayed`/`waitForClickable`.
- `isVisible()` et équivalents : `try/catch` + `return await` (sans `await`, les rejections ne sont pas interceptées).
- `platform().inWebContext()` unique pour tout le flow OIDC iOS — sortir du contexte WebView au milieu du flow FranceConnect bloque ~25s.
- Ne jamais lire `.env.local` ni afficher ses valeurs.

## Environnements / réseau

- Tout appel HTTP ajouté dans `src/helpers/partner-api/` doit avoir un timeout explicite (`AbortSignal.timeout(...)`) — un `fetch()` sans timeout remonte jusqu'au timeout Mocha du hook englobant (120-180s) en cas de coupure réseau. Voir `src/helpers/partner-api/client.ts` (`REQUEST_TIMEOUT_MS`) et `event.ts` / `consent.ts` pour le pattern de référence.

## Documentation

- Diagrammes/tableaux strictement fondés sur des preuves capturées/observées — ne pas inventer d'acteurs ou de relations non confirmées ; marquer explicitement "non confirmé" ce qui ne l'est pas.
- Ne jamais affirmer qu'un travail est terminé ou que des tests passent sans les avoir réellement exécutés et vérifiés.
