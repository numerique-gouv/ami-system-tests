# CLAUDE.md — WebdriverIO / Appium

Tests E2E mobiles (iOS + Android) et webapp (Chrome) pour l'application AMI.
Stack : WebdriverIO 10 + Appium 3 + TypeScript.

Les apps cibles sont dans les dépôts frères `../ami-app-android` et `../ami-app-ios`.

**Les cibles `just` sont pour les humains** : toute commande utile à un humain (lancer des tests, démarrer un appareil, générer un rapport, explorer une page) a une cible `just` **documentée** (commentaire d'usage au-dessus de la recette ; `just --list` les liste). Un agent peut lancer directement les outils dont il a besoin (`npm`, `npx wdio …`, `adb`, `xcrun`…) : il n'y a plus d'obligation de passer par `just`. Quand une commande directe devient utile aux humains, on l'ajoute au `justfile` avec sa documentation plutôt que de la décrire dans un texte.

```bash
just --list                                        # voir toutes les cibles disponibles
just check-code                                     # lint + typecheck (avant tout commit)
just test-android                                   # tous les tests Android
just test-ios                                       # tous les tests iOS
just test-webapp                                    # tests webapp, Chrome visible
just test-webci                                     # tests webapp, headless (mode CI)
just test-android --spec "src/tests/mobile/notifications*" # un ou plusieurs fichiers (`--spec` répétable ; glob entre guillemets)
just test-android --suite mobile_all                 # suite nommée (mobile_short|smoke|all, webapp_short|smoke|usage|all : tableau « Suites nommées » de CONTRIBUTING.md) (option native `suites` de wdio.base.conf.ts ; appel direct : `npx wdio run wdio.webapp.conf.ts --suite webapp_smoke`), idem test-ios / test-webapp / test-webci ; `--device` est lu par test-android et test-ios, le reste va à wdio
just explore-webapp "/#/agenda"                     # session d'exploration (idem explore-android, explore-ios), puis `just s <cible> snapshot -i` (DOM d'une WebView mobile : DevTools)
just debug-webapp src/tests/webapp/agenda.parcours.test.ts   # test figé à son premier échec (mobile : `npx wdio run wdio.android.conf.ts --spec … --debug=agent` ; session debug-0-0), puis `just s debug-0-0 snapshot -i`
just doctor                                         # diagnostic de l'environnement (Node, Appium, SDK, simulateurs)
just failures-text                                       # liste les tests en échec du dernier run (étapes, erreur, identifiants Sentry, chemin du transcript.md de la trace) ; `just failures-ui` ouvre la trace dans le lecteur DevTools
```

> Android tourne sur le port **4723**, iOS sur **4724** pour éviter les conflits. La webapp ne lance aucun serveur Appium (Chromedriver direct).

**Relances de specs** : `specFileRetries` = 0 par défaut et pour les mesures, 1 en CI (`CI`/`GITHUB_ACTIONS`) ; `WDIO_SPEC_FILE_RETRIES=N` ou `--specFileRetries=N` pour forcer (cf. CONTRIBUTING.md §7).

## Skills vs règles du projet

| Type | Emplacement | Usage |
|------|-------------|-------|
| **Skills** (capacités Claude exécutables) | `.claude/skills/` | Chargés via `Skill` tool. Cache projet dans `.webdriverio-skills/`. |
| **Règles générales** | [`CONTRIBUTING.md`](CONTRIBUTING.md) | POM, sélection des éléments, WebView, assertions, isolation, retry, rapports, débogage. Lire avant d'écrire du code. |
| **Cas particuliers** | commentaires dans le fichier de code concerné | non documentés dans un fichier séparé. |

La plupart des skills sous `.claude/skills/` viennent du pack tiers `klamping/webdriverio-skills`,
réinstallé par la commande directe `npx skills add klamping/webdriverio-skills` — une édition
in-place d'un de ces `SKILL.md` est **écrasée à la réinstallation du pack**. Le skill
`reconstructing-app-model` est propre à ce projet (pas issu du pack) et doit être préservé.

Dès que la webapp, l'app Android ou l'app iOS a changé, mettre à jour les tests en repartant du
skill **`reconstructing-app-model`** plutôt qu'en éditant les Page Objects/locators à la main :
c'est lui qui re-dérive le modèle applicatif à partir de preuves live, audite les guidelines du
projet par rapport à ce modèle, enrichit Page Objects/locators, et propose des scaffolds pour les
écarts de couverture nouvellement identifiés (il délègue l'exploration webapp à `analyze-website`,
la capture des écrans natifs restant à sa charge propre). Ne pas re-implémenter ce cycle
manuellement — c'est déjà le rôle de ce skill aujourd'hui.

Un constat de désynchronisation entre le modèle applicatif en cache (`.webdriverio-skills/` ou le
modèle reconstruit) et l'état réel observé d'une des apps (webapp, Android ou iOS) est en soi un
critère déclencheur pour relancer `reconstructing-app-model` sur cette app, même en l'absence
d'échec de test constaté.

Le raisonnement détaillé (tableaux page × action) derrière la règle de sélection résumée dans
CONTRIBUTING.md §2 est archivé dans l'ADR
`docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`.

## Rôle respectif des tests mobiles et webapp

Les deux familles de tests ne couvrent pas la même chose :

- **Tests mobiles (Android + iOS)** : ils testent les **écrans natifs** ET les **collaborations entre le natif et la WebView** (échanges de données, passages d'un monde à l'autre — ex. bouton FranceConnect natif → page de login de la SPA, onboarding, déconnexion). C'est ce que seul le mobile peut vérifier.
- **Tests webapp (Chrome)** : ils permettent d'aller **loin et vite** dans la navigation des pages de la SPA, sans émulateur ni simulateur.
- **Évolution prévue** : des pages de la SPA seront **progressivement « promues » en natif**, au fil des mois. La frontière natif / WebView n'est donc pas figée — un écran peut changer de nature d'une version de l'app à l'autre.

## Architecture

```
wdio.base.conf.ts          # config partagée (timeouts, reporters spec + JUnit, hooks) + suites nommées (`suites`, listes plates mobile_*, webapp_*)
wdio.android.conf.ts       # capabilities Android + service Appium port 4723
wdio.ios.conf.ts           # capabilities iOS + service Appium port 4724
wdio.webapp.conf.ts        # capabilities Chrome (headless ou visible), pas de service Appium
src/
  driver/
    capabilities.ts        # androidCapabilities / iosCapabilities (Appium)
  platform/
    index.ts               # platform() : PlatformAdapter — dispatch android/ios/webapp
    types.ts                # interface PlatformAdapter
    appium.adapter.ts       # implémentation mobile (Appium)
    browser.adapter.ts      # implémentation webapp (Chrome)
  helpers/
    spa/                   # DOM de la SPA (webapp ET WebView mobile) : spa.ts, selectors.ts (roleSelector()), webview.ts (describeCurrentPage())
    partner-api/           # publishEvent() bas niveau (retry 5xx) + publishNotification/Demarche/DemarcheEnfant
    reporting/             # step() (report), failure-dump, sentry, traced, trace-redact, junit-clean, run-dir
    common/                # environment (AMI_ENV), test-users, fc-hash, session (maskSensitiveUrl)
    webapp/                # access-code (cookie access_key), link-check
    mobile/                # device-app (adb/simctl), android-notifications, ios-notifications
  pages/
    *.page.ts              # Page Objects — actions métier, sans sélecteurs directs
    locators/
      *.locators.ts        # sélecteurs par plateforme + fonction getXxxLocators()
  scripts/
    *.ts                   # scripts CLI (failures-text, failures-ui : `just failures-text`, `just failures-ui`)
  tests/
    mobile/*.test.ts        # scénarios Mocha Android + iOS
    webapp/*.test.ts        # scénarios Mocha webapp
```

### Pattern locators

L'application étant une SPA Svelte dans une WebView, **la grande majorité des locators sont partagés** : iOS (XCUITest → WebKit Remote Debugging) et Android (UIAutomator2 → Chromedriver) exposent tous deux le DOM via le protocole W3C WebDriver standard. Les sélecteurs natifs de WDIO 10 (`role/button[name=…]`, `button*=texte`, CSS ; cf. `src/helpers/spa/selectors.ts` et `spa.ts`) sont donc identiques sur les deux plateformes.

Le dispatch `getXxxLocators()` n'est nécessaire que pour les **éléments natifs** (hors WebView) :
- `androidXxxLocators` — resource-id (`fr.gouv.ami.staging:id/<name>`)
- `iosXxxLocators` — `accessibility id` (SwiftUI `accessibilityIdentifier`)
- `getXxxLocators()` — retourne le bon objet selon `driver.isIOS`

Le dispatch de **comportement d'interaction** (pas de sélecteur) passe par `platform()` — voir
[Patterns critiques](#patterns-critiques-résumé).

### Page Objects

Les Pages Objects (`*.page.ts`) ne contiennent **aucun sélecteur** : ils appellent `getXxxLocators()` à chaque méthode. Cela permet de tester la même page sur les deux plateformes sans duplication.

Les singletons sont exportés tracés : `export default traced(new XxxPage(), 'XxxPage')` (voir `src/helpers/reporting/traced.ts`).

## Patterns critiques (résumé)

**POM 3 niveaux** : les tests n'importent que les page objects ; les pages appellent `getXxxLocators()` à chaque méthode ; les locators exposent `androidXxx`, `iosXxx`, `getXxxLocators()` (dispatch `driver.isIOS`).

**Règle `await`** : `await` uniquement devant `expect(wdioElement)` (matchers expect-webdriverio) ou devant les appels retournant une Promise. Jamais devant `expect(string|boolean|number)`.

**Abstraction de plateforme (`src/platform/`)** : `platform()` retourne un `PlatformAdapter` (android, ios ou webapp) qui isole les points de couplage mobile — `inWebContext()` (atteindre le DOM de la SPA), `isWebContextAvailable()`, `refreshAxTree()`, `pullToRefresh()`, `fcButtonIsNative`. Sur webapp, `inWebContext()` est quasi-identité (la session est déjà ce contexte).

**`platform().inWebContext()` unique pour OIDC iOS** : sortir du contexte WebView au milieu du flow FranceConnect provoque un blocage ~25 s.

**`isVisible()` try/catch + `return await`** : sans `await`, les rejections de Promise ne sont pas interceptées par `try/catch`.

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `wdio.base.conf.ts` | Config partagée (reporters spec + JUnit, `afterTest` : dump d'échec) + suites nommées (option native `suites` : `--suite`, consommée par les recettes `just *-suite` et la CI) |
| `wdio.android.conf.ts` | Capabilities Android, port 4723, `onPrepare` force-stop |
| `wdio.ios.conf.ts` | Capabilities iOS, port 4724 |
| `wdio.webapp.conf.ts` | Capabilities Chrome, `baseUrl` dérivée de `AMI_ENV`, pas de service Appium |
| `src/driver/capabilities.ts` | `androidCapabilities` / `iosCapabilities` |
| `src/platform/` | `platform()` / `PlatformAdapter` — abstraction android/ios/webapp |
| `src/helpers/spa/spa.ts` / `selectors.ts` | `roleSelector()`, `clickButton()`, `waitForHeading()`, `firstDisplayed()`… |
| `src/helpers/spa/webview.ts` | `describeCurrentPage()` |
| `src/helpers/partner-api/` | `publishEvent()` bas niveau (retry 5xx), `publishNotification()`, `publishDemarche()`, `publishDemarcheEnfant()`, consentement |
| `src/helpers/{reporting,common,webapp,mobile}/` | un sous-dossier par périmètre : reporting (step, dump d'échec, JUnit, traces), commun (environnement, utilisateurs de test, session), webapp (code d'accès, contrôle de liens), mobile (cycle de vie de l'app, notifications natives) ; pas de baril `index.ts` global |
| `src/pages/locators/` | Un fichier par écran, `getXxxLocators()` dispatch plateforme |

## Prérequis locaux

- Node.js ≥ 22.19 (LTS 24 recommandée, cf. `.nvmrc` ; requis par WDIO 10)
- `just` (`brew install just`)
- Android SDK + `adb` dans le PATH
- Xcode + `xcodegen` (`brew install xcodegen`)
- Appium 3.8 et ses drivers `appium-uiautomator2-driver` / `appium-xcuitest-driver` : devDependencies de `package.json` (versions dans le lock), installés par `npm ci` ; `APPIUM_HOME` n'est pas défini (mode « projet », drivers dans `node_modules/`)
- Simulateur iOS "iPhone 17 Pro" : `IOS_UDID` (`xcrun simctl list devices`) ; XCUITest le démarre s'il est arrêté
- Émulateur Android : AVD de type Pixel, API 36 : démarré par Android Studio (`ANDROID_UDID` s'il y en a plusieurs) ou par Appium (`ANDROID_AVD`, il s'arrête avec le run)
- Aucune recette `just` ne démarre/arrête d'appareil ni n'a d'option `--device` : variables d'environnement `ANDROID_UDID`, `ANDROID_DEVICE_NAME`, `ANDROID_AVD`, `ANDROID_AVD_ARGS`, `IOS_UDID`, `IOS_DEVICE_NAME` (gabarit `.env.example`, README « Prérequis »)

## Secrets

Variables `AMI_ENV` (environnement backend, pilote aussi le picker mobile et `resolveEnvironment()` webapp) et `NOTIF_*` dans `.env` à la racine (non commité, gabarit dans `.env.example`). `ANDROID_APP_PATH` / `IOS_APP_PATH` désignent l'app mobile à tester (seule source du chemin, README « Prérequis »). Autre fichier pour une commande : `just -E .env.local.preprod …` (convention `.env.<cible>`, tous ignorés par git ; sous `just`, wdio ne relit pas `.env`). Ne jamais écrire leurs valeurs dans du code ou du cache.
Dans les permissions, tu ne dois pas avoir le droit de lire `.env`, les commande shell s'en servent comme WDIO, scalingo, mais tu ne doit jamais utiliser d'outil pour l'afficher.

## Section Documentation

Les diagrammes et tableaux de documentation doivent être strictement fondés sur des preuves capturées ou observées.
Ne pas introduire d'acteurs spéculatifs ou de relations inférées ; si quelque chose est inconnu, le marquer comme non confirmé.

## Section Tests

Ne jamais affirmer qu'un travail est terminé ou que les tests passent sans les avoir réellement exécutés et vérifié le résultat.
Éviter les longs résumés de statut ; confirmer les résultats réels avant de conclure.

## Section Tests / E2E

Pour les locators WDIO/Appium, préférer les sélecteurs stables basés sur le DOM ou l'accessibilité plutôt que des valeurs codées en dur (ex. : éviter `/suivi` hardcodé ou la traversée arbitraire de `parentElement`) ; inspecter le HTML réellement rendu avant de choisir une stratégie.
