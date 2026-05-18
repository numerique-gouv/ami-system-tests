# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Objectif du dépôt

Ce dépôt compare **trois frameworks de tests E2E mobiles** pour l'application AMI (iOS + Android) :
- `webdriverio/` — WebdriverIO + Appium (implémentation de référence)
- `maestro/` — Maestro CLI (à implémenter)
- `playwright/` — Playwright + Appium ou WebDriver BiDi (à implémenter)

Le critère principal d'évaluation est la **maintenabilité** face à des cas complexes :
- Apps hybrides native + WebView
- Pages web qui doivent rester compatibles avec toutes les versions natives déployées
- Scénarios multi-appareils (ce qui est configuré sur l'un impacte l'autre)

Les apps cibles sont dans les dépôts frères `../ami-app-android` et `../ami-app-ios`.

## Commandes

**Toutes les commandes passent par `just`.** Ne jamais appeler directement `npm`, `npx`, `adb`, `xcodebuild` ou tout autre outil shell : ces appels doivent être encapsulés dans un justfile.

Pour connaître les commandes disponibles dans un contexte donné, se placer dans le répertoire concerné et lancer :

```bash
just --list
```

### Organisation des justfiles

Le dépôt utilise un justfile racine pour les cibles communes (build, check), et un justfile par framework pour ses cibles propres. Chaque justfile enfant commence par `import '../justfile'` pour hériter des cibles et variables du parent.

```
justfile                   # build-android, build-ios, build, check
webdriverio/justfile       # setup, test-android, test-ios, test, test-*-fast
maestro/justfile           # (à créer)
playwright/justfile        # (à créer)
```

> Les recettes importées s'exécutent avec le répertoire de travail du fichier où elles sont **définies** — les chemins relatifs du justfile racine restent donc corrects même appelés depuis un sous-dossier.

> Android tourne sur le port **4723**, iOS sur **4724** pour éviter les conflits.

## Architecture WebdriverIO

```
webdriverio/
  wdio.base.conf.ts          # config partagée (timeouts, reporters, hooks)
  wdio.android.conf.ts       # capabilities Android + service Appium port 4723
  wdio.ios.conf.ts           # capabilities iOS + service Appium port 4724
  src/
    driver/
      capabilities.ts        # androidCapabilities / iosCapabilities (Appium)
    pages/
      *.page.ts              # Page Objects — actions métier, sans sélecteurs directs
      locators/
        *.locators.ts        # sélecteurs par plateforme + fonction getXxxLocators()
    tests/
      *.test.ts              # scénarios Mocha (BDD)
```

### Pattern locators

Chaque fichier de locators expose :
- `androidXxxLocators` — resource-id (`fr.gouv.ami.staging:id/<name>`)
- `iosXxxLocators` — `accessibility id`
- `getXxxLocators()` — retourne le bon objet selon `driver.isIOS`

**Convention avec les équipes mobile** : poser le même identifiant (`accessibilityIdentifier` SwiftUI / `contentDescription` Android) pour les éléments communs → un seul locator `accessibility id` suffit alors des deux côtés.

### Page Objects

Les Pages Objects (`*.page.ts`) ne contiennent **aucun sélecteur** : ils appellent `getXxxLocators()` à chaque méthode. Cela permet de tester la même page sur les deux plateformes sans duplication.

Les singletons sont exportés (`export default new XxxPage()`).

## Cas particuliers à modéliser

Lors de l'implémentation ou de la comparaison des frameworks, traiter explicitement :

| Cas | Considérations |
|-----|---------------|
| **WebView hybride** | Appium : switch de contexte `NATIVE_APP` ↔ `WEBVIEW_*` ; Playwright : CDP natif sur Android |
| **Compat web × native** | Les locators web ne doivent pas casser quand l'app native est une version N-1 ou N-2 |
| **Multi-appareils** | Deux instances `driver` simultanées ou coordination via Appium Hub/Grid ; synchronisation entre scénarios |

## Prérequis locaux

- Node.js ≥ 20
- `just` (`brew install just`)
- Android SDK + `adb` dans le PATH
- Xcode + `xcodegen` (`brew install xcodegen`)
- `appium` global (`npm i -g appium`)
- Simulateur iOS "iPhone 15 / iOS 17.0" créé dans Xcode
- Émulateur Android "Pixel 7 / API 34" créé dans AVD Manager
