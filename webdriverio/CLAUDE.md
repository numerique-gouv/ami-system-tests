# CLAUDE.md — WebdriverIO / Appium

Tests E2E mobiles (iOS + Android) pour l'app AMI.
Stack : WebdriverIO v9 + Appium 3 + TypeScript + Testing Library.

## Règle absolue : commandes via `just`

Ne jamais appeler directement `npm`, `npx`, `adb`, `xcrun`, `xcodebuild` ou `appium`.

```bash
just --list                  # voir toutes les cibles disponibles
just build-test              # lint + typecheck (avant tout commit)
just test-android            # lancer les tests Android
just test-ios                # lancer les tests iOS
just test-android "Home"     # filtrer par nom de describe/it
just inspect                 # explorer la WebView (auto-détecte Android ou iOS via le seul appareil connecté)
just report                  # générer et ouvrir le rapport Allure
```

## Skills vs Guidelines

| Type | Emplacement | Usage |
|------|-------------|-------|
| **Skills** (capacités Claude exécutables) | `.agents/skills/` | Chargés via `Skill` tool. Cache projet dans `.webdriverio-skills/`. |
| **Guidelines** (savoir-faire du projet) | `guidelines/` | Documentation humain+IA. Lire avant d'écrire du code. |

## Index des guidelines

| Fichier | Sujet |
|---------|-------|
| `semantic-locators.md` | Testing Library en WebView, `accessibility id` en natif, dispatch via `getXxxLocators()` |
| `cross-platform-page-objects.md` | POM 3 niveaux : tests → pages → pages/locators |
| `webview-context-switching.md` | `withWebView()` seul autorisé, jamais `switchContext` direct |
| `ios-wkwebview-quirks.md` | `refreshAxTree()`, scriptTimeout, single `withWebView` pour OIDC |
| `oidc-redirect-handling.md` | Flow FranceConnect complet dans un seul `withWebView()` |
| `assertion-quality.md` | `waitUntil` avec `timeoutMsg`, pas de `browser.pause` comme sync, règle `await` |
| `test-isolation.md` | Décision `before`/`beforeEach`, `driver.reset()` interdit → `terminateApp`/`activateApp` |
| `retry-strategies.md` | `specFileRetries` vs `mochaOpts.retries` vs retry applicatif |
| `allure-reporting.md` | `addStep`, `addFeature`, `addSeverity`, `addAttachment` |
| `appium-configuration.md` | Ports (Android 4723, iOS 4724), timeouts, `chromedriverAutodownload` |
| `device-state-reset.md` | `xcrun simctl` iOS, `beforeSession` Android, idempotence |
| `debugging-workflow.md` | inspect → run → commit |
| `interactive-debugging.md` | Boucle `browser.debug()` + `listInteractive()` pour mettre au point un scénario sans relancer la session |

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

## Secrets

Variables `NOTIF_*` dans `maestro/.env` (non commité). Ne jamais écrire leurs valeurs dans du code ou du cache.
