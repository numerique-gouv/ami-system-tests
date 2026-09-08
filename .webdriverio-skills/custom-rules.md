# Règles d'équipe — ami-system-tests

_Template initial généré par `managing-project-customizations` le 2026-09-08. À maintenir par l'équipe._

## Sélecteurs

- Préférer les sélecteurs stables DOM/accessibilité (`tl().getByRole`, `getByText`, etc.) plutôt que des valeurs codées en dur (ex. éviter `/suivi` en dur ou la traversée arbitraire de `parentElement`).
- Inspecter le HTML réellement rendu (`just inspect`) avant de choisir une stratégie de sélecteur.
- Cf. `CONTRIBUTING.md §2` et l'ADR `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md` pour le raisonnement complet.

## Conventions de nommage/structure

- Page Objects (`*.page.ts`) ne contiennent aucun sélecteur — ils appellent `getXxxLocators()` à chaque méthode.
- Singletons exportés via `traced(new XxxPage(), 'XxxPage')`.
- `$(loc).method()` direct, jamais `(await $(loc)).method()`.
- `await` uniquement devant `expect(wdioElement)` ou une Promise — jamais devant `expect(string|boolean|number)`.

## Garde-fous obligatoires

- Jamais d'appel direct `npm`/`npx`/`adb`/`xcrun`/`xcodebuild`/`appium` — tout passe par `just`. Les skills du pack tiers `klamping/webdriverio-skills` (ex. `running-webdriverio-tests`) prescrivent parfois `npx wdio` en direct — voir la table de correspondance dans `project-context.md` § Correspondance skills du pack tiers → commandes `just` avant d'exécuter une commande suggérée par un skill.
- Jamais de `browser.pause()` comme mécanisme de synchronisation — utiliser `waitUntil`/`waitForDisplayed`/`waitForClickable`.
- `isVisible()` et équivalents : `try/catch` + `return await` (sans `await`, les rejections ne sont pas interceptées).
- `platform().inWebContext()` unique pour tout le flow OIDC iOS — sortir du contexte WebView au milieu du flow FranceConnect bloque ~25s.
- Ne jamais lire `.env.local` ni afficher ses valeurs.

## Environnements / réseau

- Tout appel HTTP ajouté dans `src/helpers/*-api.ts` doit avoir un timeout explicite (`AbortSignal.timeout(...)`) — un `fetch()` sans timeout remonte jusqu'au timeout Mocha du hook englobant (120-180s) en cas de coupure réseau. Voir `notifications-api.ts` pour le pattern de référence (`REQUEST_TIMEOUT_MS`).

## Documentation

- Diagrammes/tableaux strictement fondés sur des preuves capturées/observées — ne pas inventer d'acteurs ou de relations non confirmées ; marquer explicitement "non confirmé" ce qui ne l'est pas.
- Ne jamais affirmer qu'un travail est terminé ou que des tests passent sans les avoir réellement exécutés et vérifiés.
