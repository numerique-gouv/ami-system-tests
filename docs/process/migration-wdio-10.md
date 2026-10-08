# Migration vers WebdriverIO 10 — plan

Branche : `77-migre-vers-wdio-10`. Rédigé le 2026-10-08 à partir de la page officielle
[From v9 to v10](https://webdriver.io/docs/v10-migration), du billet de
[sortie](https://webdriver.io/blog/2026/10/05/webdriverio-v10-release), de la page
[AI agents](https://webdriver.io/docs/ai-agents), du bac à sable `investigations/2026-10-07-wdio-10/`
(rapport `RAPPORT.md`) et d'un audit du dépôt. Tout ce qui n'a pas été vérifié est marqué *non vérifié*.

## 1. Décisions de l'équipe (2026-10-08)

| Sujet | Décision |
|---|---|
| Installation | Cooldown npm (`min-release-age=14`) levé **pour cette seule installation**, dans une recette `just`. `@wdio/*@10.0.0` date du 2026-10-05 |
| Méthode | Codemod `@wdio/codemod` v10 et skill officiel `wdio-v10-migration`, puis **revue de chaque diff** ; audit manuel des `$()` stricts |
| Commandes directes | **Plus d'obligation de passer par `just`** (décision du 2026-10-08, généralisée). Les cibles `just` sont pour les humains et doivent être documentées ; un agent lance directement les outils |
| Allure | **Retiré**, en chantier séparé **après** la migration (mesurer la migration seule d'abord) |
| Annotations | On ne garde que les *steps* (`AllureReporter.addStep`, 64 appels) ; `addFeature`, `addSeverity`, `addEpic`, `addStory`, `addTag` disparaissent |
| Rapport de PR | JUnit XML et une action GitHub tierce de résumé de tests, en commentaire de PR et en artefact |
| Dump des échecs | Toujours produit : capture, DOM, snapshot, URL, horodatage UTC, identifiants Sentry |
| Sentry | Tenter aussi de lire le trace id de la SPA (*non vérifié*, à prototyper). Sentry n'existe que dans la SPA (`@sentry/sveltekit`) et l'API (`sentry_sdk`) : **ni l'app Android ni l'app iOS n'y sont référencées** |

## 2. Audit : page officielle → dépôt

| Rupture v9 → v10 | État du dépôt | Action |
|---|---|---|
| Node ≥ 22.19, TypeScript ≥ 5.7 | `.nvmrc` = 24, `engines` préparés (non commités) | commiter en phase 2 |
| `$()` strict (`StrictSelectorError` si ≠ 1 élément) | ~25 appels sur locators, pas de codemod. Candidats : `profile.page` (menu, `… b`), `franceconnect-mire`, `onboarding-notifications` (prédicats iOS), `home.page` (`screenRoot`). Le picker est déjà corrigé | audit manuel, un par un |
| `getCookies('x')` → `getCookies({name})` | `helpers/session.ts` passe un tableau ; WDIO 9 signale déjà la dépréciation | corriger, vérifier en v10 |
| Types : `ChainablePromiseElement` retiré | utilisé dans `environment-picker.page.ts` ; `CLAUDE.md` impose cette forme | `WebdriverIO.Element` ; réécrire la règle |
| Mocha 12 : `failHookAffectedTests` = `true` | nos `before all` qui échouent feront échouer leurs tests dépendants | prévenir : les décomptes changent |
| `expect-webdriverio` 8 | `toHaveText($$())` compare index par index | grep des matchers, une revue |
| `executeAsync`, `touchAction`, `uploadFile`, `throttle`, `switchToFrame`, multiremote | aucun usage | rien |
| Allure : `addEnvironment` supprimé | non utilisé | rien (Allure sera retiré après) |
| `specs` dans `capabilities` | les nôtres sont à la racine de la config | rien |
| Appium 3, `appium:automationName` | déjà conformes | rien |
| ESLint 10 flat config, `eslint-plugin-wdio` | ESLint 10 présent | **adopté** (décision du 2026-10-08, §8) : `flat/recommended` actif, notre doublon `@typescript-eslint/no-floating-promises` retiré |
| Chrome for Testing via `@puppeteer/browsers` 3 (`modern-tar`) | notre contournement `_ensure-chrome` existe à cause de `extract-zip` | retirer **après** des suites vertes sans lui |

Typecheck du projet contre WDIO 10 dans le bac à sable : 0 erreur enregistrée (`typecheck.log`).

## 3. Phases

1. **Décisions.** Faites (§1).
2. **Préparation.** Commiter les fichiers déjà prêts (`package.json`, `.nvmrc`, lignes Node de `README.md` et `CLAUDE.md`). Installer WDIO 10 par une recette `just` (cooldown levé pour elle seule), régénérer `package-lock.json`. Critère : `just check-code` vert.
3. **Migration du code.** Codemod, skill, puis revue ; audit des `$()` ; cookies ; types ; config Mocha ; expect-webdriverio ; ESLint. Critère : `check-code` vert, un commit par famille de changements.
4. **Validation.** Webapp d'abord (la plus rapide), puis Android, puis iOS. Référence avant migration : Android 14/14, iOS 13/14, webapp 46/47 (échecs de données ou d'infra connus, cf. mémoire du projet). Critère : pas de régression par rapport à cette référence, sur au moins 3 runs.
5. **Méthodes de travail modernes** (§4) décrites et documentées **avant** d'écrire les outils.
6. **Outils associés** : recettes `just`, skill `wdio-session`, `.wdio/` dans `.gitignore`, règle de `CLAUDE.md`.
7. **Décommissionnement** (§6), en chantier séparé.
8. **Chantier Allure** (§5), séparé, après la migration.

## 4. Méthodes de travail modernes (à valider)

Source : `RAPPORT.md` du bac à sable, essais réels le 2026-10-07 et 08.

- **Explorer une UI.** `wdio session open <cible>` ; `snapshot -i` (éléments avec refs `e1`, `e2`) ; `click e3` renvoie le diff de la page et le code WDIO exécuté ; `find "texte"` ; `fill`, `wait --text` ; `logs --errors`, `requests`. Une session survit à la commande et s'arrête après 30 min d'inactivité.
- **Écrire un test.** `export --out <fichier>` transforme les étapes en spec Mocha avec sélecteurs `role/…`. À relire puis ranger dans un Page Object (CONTRIBUTING).
- **Déboguer un échec.** `wdio run … --debug=agent` met le test en **pause** au premier échec (session `debug-0-0`) ; on inspecte (`snapshot`, `screenshot`, `contexts`, `exec`) puis `resume`. *Observé* : en mobile, il ne se déclenche pas sur un échec de **hook** (`before all`), seulement sur un test.
- **Limites mobiles observées.** En Android hybride, `snapshot` et `find` lisent l'arbre natif même après `contexts switch`. Sur iOS, l'arbre natif expose pourtant le contenu de la WebView (testé sur l'écran d'accueil et le menu « Plus »).
- **Sélecteurs.** `role/button[name="…"]` (nom exact, web seulement). En natif iOS : prédicats (`-ios predicate string:`) ; un `$()` ne doit viser qu'un élément.
- **Diagnostic.** `wdio session doctor [android|ios]`.
- **Remplace** `just inspect` (`src/scripts/inspect-webview.ts`, `helpers/inspect.ts`, `helpers/repl.ts`). *Non vérifié* : parité complète (le REPL permettait des commandes libres).

## 5. Chantier Allure (après la migration)

- **À retirer** : `@wdio/allure-reporter`, `allure`, `allurerc.mjs`, recettes `open-report` / `report`, `allure-cleanup.yml`, publication d'historique dans `workflow-e2e-main.yml`.
- **À remplacer** : 137 appels `AllureReporter.*` dans 36 fichiers → un module `step()` qui journalise ; le reste est supprimé.
- **Rapport** : reporter JUnit XML ; commentaire de PR et artefact via une action tierce. **À faire avant de choisir** : comparer les actions de résumé JUnit existantes, **épingler par SHA de commit**, restreindre les permissions du job au strict nécessaire (*non vérifié*).
- **Dump des échecs** (`afterTest`, déjà partiellement en place) : capture, DOM (`getPageSource`), snapshot d'accessibilité, URL **sans jeton** (`maskSensitiveUrl`), horodatage UTC, environnement, plateforme, trace id Sentry.
- **Sentry** (décision du 2026-10-08) : journaliser dans le hook d'échec un identifiant lié à l'erreur transmise à Sentry suffit. Lecture dans la SPA (SDK 10.72.0 sur staging, vérifié en direct) : `window.__SENTRY__[version].defaultCurrentScope.getPropagationContext().traceId` (le trace id **change à chaque chargement de page**, pas de span id) et `defaultIsolationScope.lastEventId()` (existe, `null` sans erreur ; son comportement après une vraie erreur n'est **pas vérifié**, on n'envoie pas d'événement de sonde à Sentry). La version du SDK se découvre, elle ne se code pas en dur. Sur iOS, la lecture exige un contexte WebView : à protéger (blocage WebKit). **Apps natives : aucune intégration Sentry aujourd'hui** ; si elles s'y mettent, capturer aussi leurs identifiants.
- **Skill `analyzing-test-flakiness`** : lit `allure-results/*-result.json` ; à adapter au JUnit/JSON avant le retrait d'Allure.

## 6. Candidats au décommissionnement

À confirmer **après** les méthodes modernes en service :

| Candidat | Remplaçant | Condition |
|---|---|---|
| `just inspect`, `src/scripts/inspect-webview.ts`, `src/helpers/inspect.ts`, `src/helpers/repl.ts`, `WDIO_DEBUG` | `wdio session`, `--debug=agent` | recettes `explore`/`debug` validées |
| `_ensure-chrome`, `update-chrome`, `.chrome-version` (épinglage) | téléchargement natif WDIO 10 | suites webapp vertes sans la recette, plusieurs runs ; l'épinglage de version reste à décider |
| Règle `CLAUDE.md` sur `ChainablePromiseElement` | `WebdriverIO.Element` | types migrés |
| Skills du pack tiers sur WDIO 9 | skill officiel `wdio-session` | à comparer |

## 7. Risques et points ouverts

- **Instabilité iOS** (blocage WebKit, test d'authentification en timeout dans 2 runs sur 3 lors de la dernière campagne) : à ne pas confondre avec une régression de WDIO 10. Reprise prévue dans une session dédiée (mémoire `project-ios-webkit-open-points`).
- **Sonde native iOS** (`fcButtonNativeAx`, commit `81d4c4f`) non mesurée.
- **Divergences de la doc** : `browser.act()` / `extract()` introuvables dans le paquet 10.0.0 installé (le billet de sortie les annonce).
- **Action GitHub tierce** : dépendance de la chaîne CI ; version et permissions à auditer.

## 8. Journal d'exécution (2026-10-08)

**Fait** (non commité à cette date) : phases 1 à 4 pour la webapp et Android ; iOS mesuré.

- **Installation.** `webdriverio` et tous les `@wdio/*` en **10.0.1** (`^10.0.0` résout 10.0.1), plus aucun paquet v9 ; `package-lock.json` régénéré avec `npm_config_min_release_age=0` **pour cette commande seulement**. Trois paquets ont des scripts d'installation non couverts par `allowScripts` (`appium@3.7.0`, `edgedriver@7.0.0`, `geckodriver@7.0.0`) : aucun n'a été approuvé.
- **Skill officiel.** `wdio-v10-migration` copié tel quel dans `.claude/skills/` (le CLI `npx skills add` clone tout le dépôt WebdriverIO et ne répond pas).
- **Codemod : divergence entre la doc et npm.** La page officielle et le skill demandent `@wdio/codemod/v10`, mais le paquet publié s'arrête à la 0.12.0 (2022). La transformation n'existe que sur la branche `v10-legacy-command-signatures` de `webdriverio/codemod`. Exécutée, elle n'a fait que reformater 20 fichiers et réécrit rien d'utile (son `getCookies` ne reconnaît que les littéraux) : annulée, correction manuelle de `helpers/session.ts` (`getCookies({name})`).
- **Types.** `just check-code` : 0 erreur.
- **`tsconfig.json`** (étape 7 du skill) : `module` et `moduleResolution` à `NodeNext`, `ignoreDeprecations` et `baseUrl` retirés, chemins des alias en `./src/…`. Vérifié : `check-code`, une suite webapp réelle (alias résolus à l'exécution) et le chargement des scripts `ts-node`.
- **Règle `ChainablePromiseElement`** de `CLAUDE.md` supprimée : un sélecteur ESLint `no-restricted-syntax` signale `(await $(loc)).méthode()` (testé : `tsc` n'émet pas TS 80007, et `await-thenable` ne le voit pas).
- **Règle « tout passe par just »** retirée partout (voir §1).

**Constats propres à WDIO 10**

1. **`$()` strict : le picker d'environnement.** Sur iOS **et** Android, la tuile contient deux textes « Staging » (titre et sous-titre). `isEnvironmentPickerVisible` avalait l'erreur (`.catch(() => false)`) : picker jugé absent, tuile jamais cliquée, aucune WebView (**21 échecs Android** à la première passe). Corrigé en visant la tuile entière : iOS `XCUIElementTypeButton` avec `label BEGINSWITH "Staging"` ; Android `clickable(true).childSelector(textStartsWith("Staging"))` (1 élément, `getText()` renvoie le titre). Vérifié sur l'émulateur et le simulateur.
2. **Les `.catch(() => false)` masquent les violations strictes.** Même risque ailleurs : à auditer (§3, phase 3).

**Mesures sur WDIO 10.0.1** (une passe complète, comparées à la référence WDIO 9 de la veille)

| Plateforme | Référence WDIO 9 | WDIO 10 | Remarque |
|---|---|---|---|
| Android `mobile_all` | 14/14 | **14/14** | après correction du picker |
| webapp `webapp_all` | 46/47 | 46/47 | l'échec n'est pas le même : voir ci-dessous |
| iOS `mobile_all` | 13/14 | 11/14 | 3 échecs de familles déjà connues (callback d'authentification bloqué, deux tests « Démarches »), aucun message propre à WDIO 10 |

- **Webapp, « Agenda › Préférences » :** échec **3 fois sur 3**. Cause établie par `--debug=agent` : le clic mène désormais à une **route** `#/preferences/zones` (page avec « Retour à la page précédente » et les cases Zone A, B, C…), plus à un dialogue « Zones scolaires ». Le test attend l'ancien dialogue. Le dépôt SPA local date du 24 septembre et n'a pas cette route : **inférence** (non prouvée) d'un déploiement de staging entre la passe de midi (ce test passait) et celle de 16h45. Sans rapport avec WDIO 10. À traiter avec `reconstructing-app-model`.
- **Webapp, « Préférences › Suivi des démarches » :** la liste attendue contient le partenaire « Test », absent de la réponse (donnée du compte de test).

**Reste à faire** : audit des autres `$()` mobiles et des `.catch(() => false)` ; `eslint-plugin-wdio` (`wdio/no-floating-promise`) ; réécriture de `CONTRIBUTING.md` et recettes `just` pour `wdio session` (phases 5 et 6) ; décommissionnement (phase 7) ; chantier Allure (§5).

### Suite du 2026-10-08 (soir)

**Décisions de l'équipe**
- **Chrome** : plus d'épinglage, WDIO 10 choisit la version. Retirés : `_ensure-chrome`, `update-chrome`, `.chrome-version`, `browserVersion` dans `wdio.webapp.conf.ts`. Vérifié : avec un cache vide, WDIO 10 télécharge Chrome et chromedriver tout seul et la suite webapp d'authentification passe. **Risque assumé** : une mise à jour de Chrome peut changer le comportement des tests (c'était la raison de l'épinglage).
- **`eslint-plugin-wdio` actif** (`flat/recommended`, analyse typée) : `no-floating-promise` (remplace `@typescript-eslint/no-floating-promises`, même couverture vérifiée sur 4 cas, y compris les promesses ordinaires), `no-pause`, `no-debug`. Deux `browser.pause` existants (`dom-query.ts`, `suivi-demarches.page.ts`) réécrits avec `browser.waitUntil`. La règle de `CLAUDE.md` « pas de `browser.pause` comme sync » est retirée : redondante avec `check-code`.
- **Mobile et SPA : aucune modification** (décision explicite). L'écran d'onboarding des notifications existe deux fois dans l'arbre natif iOS (feuille SwiftUI et page de la SPA derrière, même libellé, aucun identifiant : pas d'`accessibilityIdentifier` dans `ami-app-ios`, et `data-testid="skip-button"` n'est pas exposé nativement). Ni « natif ou WebView » ni la position ne tiennent quand les pages passeront en natif : **on prend le premier et on signale** (`ANOMALIE`, 8 occurrences sur une passe iOS). Un XPath « hors WebView » essayé puis abandonné.
- **Sentry** : journaliser l'identifiant lié à l'erreur suffit ; pas d'événement de sonde (voir §5).

**Mesures**
- Android 14/14 (corrigé, voir constat 1). webapp 46/47 (« Agenda › Préférences » : changement de l'app). iOS : 14/14 avec « premier + signalement » ; une passe intermédiaire a échoué en cascade à cause d'une **page d'erreur du fournisseur d'identité de démonstration FranceConnect** (Y000000), sans rapport avec le code.

**Constat 3 (garde)** : `src/helpers/strict.ts` (`rethrowStrictViolation`) dans les sondes qui avalaient les erreurs ; sa première utilité réelle a été de faire remonter la violation stricte iOS ci-dessus.

### Chantier Allure — fait (2026-10-08)

- **Retiré** : `@wdio/allure-reporter`, `allure`, `allurerc.mjs`, recettes `open-report` / `report` / `generate-report`, scripts npm associés, entrées `.gitignore`.
- **Remplacé par** : `step()` (`src/helpers/report.ts`, 64 appels convertis ; les 101 autres annotations supprimées dans 35 fichiers), reporter JUnit (`test-results/junit/results-<cible>-<cid>.xml`, `suiteNameFormat` Unicode pour garder les accents, `addWorkerLogs: true` pour que la console du scénario précède les lignes brutes `COMMAND`/`RESULT`), dump systématique d'un test en échec (`src/helpers/failure-dump.ts` : capture, `dom.html` ou `native-source.xml`, `interactive.txt`, `context.json` avec étapes, URL aux jetons masqués, horodatage UTC, identifiants Sentry), `just failures`.
- **CI** : `workflow-e2e-main.yml` publie un artefact `test-results-<slug>-run<N>` et un résumé JUnit (`mikepenz/action-junit-report`, épinglée par SHA, v6.6.0) ; la sortie du workflow devient `test_results` ; le commentaire de PR est posté par le workflow appelant (exemple réécrit). **Non testé en CI réelle** (YAML validé seulement). `allure-cleanup.yml` garde son nom (les dépôts frères le déclenchent par ce nom) : à renommer avec eux. Trois prototypes de `workflows-samples/` marqués obsolètes.
- **Skill `analyzing-test-flakiness`** : `analyze_flakiness.py` réécrit pour lire JUnit et les dumps (cascades comptées à part, rapprochement test ↔ dump tolérant à la ponctuation, identifiants Sentry dans les clusters). Perd les catégories d'`allurerc.mjs`.
- **Mesures** (une passe, WDIO 10.0.1) : Android 14/14 ; iOS 11/14 (les trois échecs de reconnexion déjà connus) ; webapp 45/47 (« Agenda › Préférences », changement de l'app, et « la barre basse ouvre Suivi puis revient à l'accueil » : `stale element reference` à l'étape 2, famille connue du clic « Accueil »).
- **Reste** : renommer `allure-cleanup.yml` avec les dépôts frères ; vérifier le workflow en CI réelle ; choisir si l'on retire aussi les lignes brutes `COMMAND`/`RESULT` du JUnit (aujourd'hui placées après la console) ; vérifier `lastEventId` de Sentry après une vraie erreur (non fait : pas d'événement de sonde) ; points iOS reportés (blocage WebKit, sonde native non mesurée).
