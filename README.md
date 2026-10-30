# Tests E2E — AMI

Tests système mobiles (iOS + Android) et webapp (Chrome) de l'application AMI : authentification FranceConnect, notifications, démarches, etc.

**Stack** : WebdriverIO 10 + Appium 3 + TypeScript. Les apps testées sont dans les dépôts frères `../ami-app-android` et `../ami-app-ios`.

Pour écrire ou modifier un test : [CONTRIBUTING.md](CONTRIBUTING.md). Pour travailler avec Claude Code : [CLAUDE.md](CLAUDE.md).

---

## Prérequis

| Outil | Installation |
|-------|-------------|
| Node.js ≥ 22.19 (LTS 24, cf. `.nvmrc`) | [nodejs.org](https://nodejs.org) |
| `just` | `brew install just` |
| Android SDK + `adb` | Android Studio → SDK Manager |
| Xcode + `xcodegen` | App Store + `brew install xcodegen` |
| Appium 3.8 et ses drivers `appium-uiautomator2-driver` / `appium-xcuitest-driver` | `npm ci` (devDependencies, mode « projet » : `APPIUM_HOME` non défini) |

### Appareils

Les tests ne démarrent ni n'arrêtent aucun appareil. `just start` liste ce qui est démarrable ; `just start Pixel_modern` ou `just start "iPhone 17 Pro"` démarre l'appareil et affiche son UDID ; `just stop [NOM]` l'éteint. L'appareil visé se désigne par variable d'environnement, jamais par option :

- **Android** : AVD de type Pixel, API 36. `ANDROID_UDID` est le numéro de série adb (`adb devices`). Sans lui, Appium prend le premier appareil connecté.
- **iOS** : simulateur iPhone 17 Pro. `IOS_UDID` est l'UUID de `xcrun simctl list devices`. Sans lui, Appium peut créer un simulateur temporaire très lent.

### Apps mobiles (`ANDROID_APP_PATH`, `IOS_APP_PATH`)

Les tests installent l'app que désignent ces deux variables, seule source du chemin. Chemin relatif : depuis la racine du projet ; `~/` : dossier personnel ; pas de motif `*`.

| Plateforme | Construire l'app | Variable (exemple staging) |
|---|---|---|
| Android | Android Studio, ou `./gradlew assembleStagingDebug` dans `../ami-app-android` (préprod : `assemblePreprodDebug`) | `ANDROID_APP_PATH=../ami-app-android/app/build/outputs/apk/staging/debug/app-staging-debug.apk` |
| iOS | Xcode (scheme `AMI-Staging`, destination simulateur), ou `just build-staging` dans `../ami-app-ios` | `IOS_APP_PATH=~/Library/Developer/Xcode/DerivedData/AMI-xcodegen-<suffixe>/Build/Products/Debug-iphonesimulator/AMI-Staging.app` (`<suffixe>` : `ls ~/Library/Developer/Xcode/DerivedData`) |

`AMI_ENV` doit correspondre à l'app visée (staging ou préprod).

### Ports (second appareil en parallèle)

`ANDROID_APPIUM_PORT` (4723), `IOS_APPIUM_PORT` (4724), `ANDROID_SYSTEM_PORT` (8200), `ANDROID_CHROMEDRIVER_PORT` (9515), `IOS_WDA_PORT` (8100). Le second run a aussi son propre appareil (`ANDROID_UDID`, `IOS_UDID`).

### Fichiers d'environnement

`.env.example` est le gabarit commité, sans secret. Chaque poste le copie en `.env` (ignoré par git) et le remplit. WebdriverIO charge `.env` seul, avec ou sans `just`. Pour une autre cible, un fichier `.env.<cible>` (`.env.staging`, `.env.preprod`, ignorés par git) se choisit pour une commande :

```bash
just -E .env.preprod test-ios --suite mobile_short
node --env-file=.env.preprod node_modules/.bin/wdio run wdio.ios.conf.ts --suite mobile_short
```

Priorité : variable du shell, puis `.env.<cible>`, puis `.env`. Les valeurs ne s'écrivent jamais dans le code.

---

## Installation

```bash
cp .env.example .env     # puis remplir AMI_ENV et les variables NOTIF_*
npm ci
just doctor              # diagnostic de l'environnement
```

---

## Lancer les tests

```bash
just test-android                                      # tous les tests Android
just test-ios                                          # tous les tests iOS
just test-webapp                                       # webapp, Chrome visible
just test-webci                                        # webapp, headless (mode CI)
just test-android --spec "src/tests/mobile/notifications*"   # un ou plusieurs fichiers (--spec répétable)
just test-android --suite mobile_all                   # suite nommée (définies dans wdio.base.conf.ts), idem test-ios / test-webapp / test-webci
ANDROID_UDID=emulator-5560 just test-android --suite mobile_short   # appareil précis
just check-code                                        # lint + typecheck, avant tout commit
just failures-text                                     # tests en échec du dernier run
just failures-ui                                       # trace d'un test en échec dans le lecteur DevTools
just --list                                            # toutes les commandes
```

Les commandes utiles aux humains sont des cibles `just` documentées ; `npx wdio`, `adb` ou `xcrun` peuvent aussi être lancés directement.

---

## Architecture

```
wdio.base.conf.ts          config partagée (timeouts, reporters, hooks) et suites nommées
wdio.android.conf.ts       capabilities Android, Appium port 4723
wdio.ios.conf.ts           capabilities iOS, Appium port 4724
wdio.webapp.conf.ts        Chrome, sans Appium
src/
  driver/                  capabilities Appium
  platform/                platform() : adaptateur android / ios / webapp
  helpers/                 spa, partner-api, reporting, common, webapp, mobile
  pages/                   Page Objects (*.page.ts) et locators (locators/*.locators.ts)
  scripts/                 failures-text, failures-ui
  tests/                   mobile/ et webapp/ (scénarios Mocha), tutorial/
docs/adr/                  décisions d'architecture
```

---

## Intégration continue

Un workflow réutilisable lance les suites par plateforme (Android, iOS, webapp) depuis les dépôts frères, sur pull request. Chaque plateforme publie un artefact (JUnit enrichi et dumps des échecs), et un commentaire de la PR liste les échecs avec leur lien Sentry. Ce que la CI lance correspond aux suites nommées de `wdio.base.conf.ts` : reproduire un run CI, c'est lancer la suite du même nom.

`specFileRetries` vaut 1 en CI et 0 ailleurs ; `WDIO_SPEC_FILE_RETRIES=N` ou `--specFileRetries=N` pour forcer. Détail : [`docs/adr/2026-08-04-Integration-continue-Github-Actions.md`](docs/adr/2026-08-04-Integration-continue-Github-Actions.md).

---

## Docs utiles

- [les démarches de DN](https://docs.numerique.gouv.fr/docs/1ce135fb-6fb3-4ff5-a53e-27f3670dbd8e/)
- [Les recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)
- Décision sur la sélection des éléments : [`docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`](docs/adr/2026-07-09-Strategie-de-selection-des-elements.md)
