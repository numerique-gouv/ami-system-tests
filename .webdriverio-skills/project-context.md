# Contexte projet — WebdriverIO / Appium

Mis à jour : 2026-06-03

## Stack

- **WebdriverIO v9** + **Appium 3**
- **TypeScript** (strict), ESLint flat config
- **Testing Library** (`@testing-library/webdriverio`) pour les requêtes DOM en WebView
- **Allure** (`@wdio/allure-reporter`) pour le reporting
- Framework de test : **Mocha** (BDD)

## Lancer les tests

```bash
just test-android            # Android (port 4723)
just test-ios                # iOS (port 4724)
just test-android "Titre"    # filtrer par nom de test
just check-code              # lint + typecheck (avant commit)
just open-report             # générer + ouvrir rapport Allure
```

> **Ne jamais appeler npm/npx/adb/xcrun directement** — tout passe par `just`.

## Architecture

```
wdio.base.conf.ts      config partagée (reporters Allure, afterTest)
wdio.android.conf.ts   capabilities Android + port 4723 + beforeSession
wdio.ios.conf.ts       capabilities iOS + port 4724
src/
  driver/
    capabilities.ts    androidCapabilities / iosCapabilities
  pages/
    *.page.ts          Page Objects (actions, sans sélecteurs)
    locators/
      *.locators.ts    sélecteurs par plateforme + getXxxLocators()
  tests/
    *.test.ts          scénarios Mocha
  helpers/
    webview.ts         withWebView, tl, refreshAxTree, waitForWebViewContext
    notifications-api.ts  publishNotification avec retry
```

## Pattern locators (cross-platform)

Chaque fichier expose `androidXxxLocators`, `iosXxxLocators`, et `getXxxLocators()` qui retourne le bon objet selon `driver.isIOS`. Les pages appellent `getXxxLocators()` à chaque méthode — jamais de sélecteur en dur dans les pages.

## Helpers WebView critiques

- **`withWebView<T>(fn)`** — switch NATIVE → WEBVIEW, exécute `fn`, revient toujours en NATIVE (finally)
- **`tl()`** — instance Testing Library scopée au WebView courant
- **`refreshAxTree()`** — force la re-sérialisation AX iOS (appelle `getPageSource()`) pour corriger le bug de tree stale
- **`waitForWebViewContext()`** — attend qu'un contexte WEBVIEW soit disponible

## Captures en cas d'échec

Le hook `afterTest` (wdio.base.conf.ts) :
- Prend un screenshot et l'attache à Allure + l'écrit sur disque (`.wdio-logs/screenshots/`)
- Capture le DOM HTML si le contexte courant est WEBVIEW (conditionnel — évite le blocage iOS)

## Secrets

Variables `NOTIF_*` dans `maestro/.env` (non commité). Voir `.env.example` pour les noms.
Ne jamais écrire leurs valeurs dans du code, des tests, ou des fichiers de cache.

## Règles et guidelines

- Règles équipe courtes : `.webdriverio-skills/custom-rules.md`
- Documentation approfondie : `guidelines/` (12 fichiers, indexés dans `CLAUDE.md`)
