# CLAUDE.md — WebdriverIO / Appium

Tests E2E mobiles (iOS + Android) pour l'application AMI.
Stack : WebdriverIO v9 + Appium 3 + TypeScript + Testing Library.

Les apps cibles sont dans les dépôts frères `../ami-app-android` et `../ami-app-ios`.

Les commandes se lancent toujours via `just`.

Ne jamais appeler directement `npm`, `npx`, `adb`, `xcrun`, `xcodebuild` ou `appium`. Ces appels doivent être encapsulés dans le `justfile`.

```bash
just --list                  # voir toutes les cibles disponibles
just check-code              # lint + typecheck (avant tout commit)
just test-android            # lancer les tests Android
just test-ios                # lancer les tests iOS
just test-android "Home"     # filtrer par nom de describe/it
just inspect                 # explorer la WebView (auto-détecte Android ou iOS via le seul appareil connecté)
just open-report             # générer et ouvrir le rapport Allure
```

> Android tourne sur le port **4723**, iOS sur **4724** pour éviter les conflits.

## Skills vs Guidelines

| Type | Emplacement | Usage |
|------|-------------|-------|
| **Skills** (capacités Claude exécutables) | `.agents/skills/` | Chargés via `Skill` tool. Cache projet dans `.webdriverio-skills/`. |
| **Guidelines** (savoir-faire du projet) | `guidelines/` | Documentation humain+IA. Lire avant d'écrire du code. |

Tous les fichiers de guidelines sont dans `docs/guidelines/`.

| Fichier | Sujet |
|---------|-------|
| `semantic-locators.md` | Testing Library en WebView, `accessibility id` en natif, dispatch via `getXxxLocators()` |
| `cross-platform-page-objects.md` | POM 3 niveaux : tests → pages → pages/locators |
| `webview-context-switching.md` | `withWebView()` seul autorisé, jamais `switchContext` direct |
| `webview-quirks.md` | `refreshAxTree()`, scriptTimeout (iOS), `executeAsync` tué pendant navigation (iOS + Android) |
| `oidc-redirect-handling.md` | Flow FranceConnect complet dans un seul `withWebView()` |
| `assertion-quality.md` | `waitUntil` avec `timeoutMsg`, pas de `browser.pause` comme sync, règle `await` |
| `test-isolation.md` | Décision `before`/`beforeEach`, `driver.reset()` interdit → `terminateApp`/`activateApp` |
| `spa-navigation.md` | Navigation SPA hybride : clic vs JS hash, pull-to-refresh natif, tab switching, responsabilité PO |
| `retry-strategies.md` | `specFileRetries` vs `mochaOpts.retries` vs retry applicatif |
| `allure-reporting.md` | `addStep`, `addFeature`, `addSeverity`, `addAttachment` |
| `appium-configuration.md` | Ports (Android 4723, iOS 4724), timeouts, `chromedriverAutodownload` |
| `device-state-reset.md` | `xcrun simctl` iOS, `beforeSession` Android, idempotence |
| `debugging-workflow.md` | inspect → run → commit |
| `interactive-debugging.md` | Boucle `browser.debug()` + `listInteractive()` pour mettre au point un scénario sans relancer la session |

## Architecture

```
wdio.base.conf.ts          # config partagée (timeouts, reporters Allure, hooks)
wdio.android.conf.ts       # capabilities Android + service Appium port 4723
wdio.ios.conf.ts           # capabilities iOS + service Appium port 4724
src/
  driver/
    capabilities.ts        # androidCapabilities / iosCapabilities (Appium)
  helpers/
    webview.ts             # withWebView<T>(), tl(), refreshAxTree(), waitForWebViewContext()
    notifications-api.ts   # publishNotification() avec retry 5xx
  pages/
    *.page.ts              # Page Objects — actions métier, sans sélecteurs directs
    locators/
      *.locators.ts        # sélecteurs par plateforme + fonction getXxxLocators()
  tests/
    *.test.ts              # scénarios Mocha (BDD)
```

### Pattern locators

L'application étant une SPA Svelte dans une WebView, **la grande majorité des locators sont partagés** : iOS (XCUITest → WebKit Remote Debugging) et Android (UIAutomator2 → Chromedriver) exposent tous deux le DOM via le protocole W3C WebDriver standard. Les requêtes Testing Library (`tl().getByRole`, `tl().findByText`) sont donc identiques sur les deux plateformes.

Le dispatch `getXxxLocators()` n'est nécessaire que pour les **éléments natifs** (hors WebView) :
- `androidXxxLocators` — resource-id (`fr.gouv.ami.staging:id/<name>`)
- `iosXxxLocators` — `accessibility id` (SwiftUI `accessibilityIdentifier`)
- `getXxxLocators()` — retourne le bon objet selon `driver.isIOS`

### Page Objects

Les Pages Objects (`*.page.ts`) ne contiennent **aucun sélecteur** : ils appellent `getXxxLocators()` à chaque méthode. Cela permet de tester la même page sur les deux plateformes sans duplication.

Les singletons sont exportés (`export default new XxxPage()`).

## Patterns critiques (résumé)

**POM 3 niveaux** : les tests n'importent que les page objects ; les pages appellent `getXxxLocators()` à chaque méthode ; les locators exposent `androidXxx`, `iosXxx`, `getXxxLocators()` (dispatch `driver.isIOS`).

**WDIO v9 ChainablePromiseElement** : écrire `$(loc).method()` directement, jamais `(await $(loc)).method()` (déclenche TS [80007]).

**Règle `await`** : `await` uniquement devant `expect(wdioElement)` (matchers expect-webdriverio) ou devant les appels retournant une Promise. Jamais devant `expect(string|boolean|number)`.

**Pas de `browser.pause` comme sync** : remplacer par `waitUntil`, `waitForDisplayed`, ou `waitForClickable`.

**`withWebView()` unique pour OIDC iOS** : sortir du contexte WebView au milieu du flow FranceConnect provoque un blocage ~25 s.

**`isVisible()` try/catch + `return await`** : sans `await`, les rejections de Promise ne sont pas interceptées par `try/catch`.

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `wdio.base.conf.ts` | Config partagée (reporters Allure, `afterTest` screenshot+attachement) |
| `wdio.android.conf.ts` | Capabilities Android, port 4723, `beforeSession` force-stop |
| `wdio.ios.conf.ts` | Capabilities iOS, port 4724 |
| `src/driver/capabilities.ts` | `androidCapabilities` / `iosCapabilities` |
| `src/helpers/webview.ts` | `withWebView<T>()`, `tl()`, `refreshAxTree()`, `waitForWebViewContext()` |
| `src/helpers/notifications-api.ts` | `publishNotification()` avec retry 5xx |
| `src/pages/locators/` | Un fichier par écran, `getXxxLocators()` dispatch plateforme |

## Prérequis locaux

- Node.js ≥ 20
- `just` (`brew install just`)
- Android SDK + `adb` dans le PATH
- Xcode + `xcodegen` (`brew install xcodegen`)
- `appium` global (`npm i -g appium`)
- Simulateur iOS "iPhone 17 Pro" (ou surcharger `IOS_SIMULATOR` dans `.env.local`)
- Émulateur Android : AVD de type Pixel, API 36 (nom via `ANDROID_DEVICE_NAME` dans `.env.local`)

## Secrets

Variables `NOTIF_*` dans `.env.local` à la racine (non commité, gabarit dans `.env`). Ne jamais écrire leurs valeurs dans du code ou du cache.
Dans les permissions, tu ne dois pas avoir le droit de lire `.env.local`, les commande shell s'en servent comme WDIO, scalingo, mais tu ne doit jamais utiliser d'outil pour l'afficher.

## Section Documentation

Les diagrammes et tableaux de documentation doivent être strictement fondés sur des preuves capturées ou observées.
Ne pas introduire d'acteurs spéculatifs ou de relations inférées ; si quelque chose est inconnu, le marquer comme non confirmé.

## Section Tests

Ne jamais affirmer qu'un travail est terminé ou que les tests passent sans les avoir réellement exécutés et vérifié le résultat.
Éviter les longs résumés de statut ; confirmer les résultats réels avant de conclure.

## Section Tests / E2E

Pour les locators WDIO/Appium, préférer les sélecteurs stables basés sur le DOM ou l'accessibilité plutôt que des valeurs codées en dur (ex. : éviter `/suivi` hardcodé ou la traversée arbitraire de `parentElement`) ; inspecter le HTML réellement rendu avant de choisir une stratégie.
