# Tests E2E — AMI

Suite de tests système mobiles (iOS + Android) et webapp (Chrome) pour l'application AMI.
Les scénarios couvrent les parcours utilisateurs complets : authentification FranceConnect, notifications push, démarches, etc.

**Stack** : WebdriverIO 10 + Appium 3 + TypeScript

---

## Prérequis

| Outil | Installation |
|-------|-------------|
| Node.js ≥ 22.19 (LTS 24, cf. `.nvmrc`) | [nodejs.org](https://nodejs.org) |
| `just` | `brew install just` |
| Android SDK + `adb` | Android Studio → SDK Manager |
| Xcode + `xcodegen` | App Store + `brew install xcodegen` |
| Appium 3.8 et ses drivers `appium-uiautomator2-driver` / `appium-xcuitest-driver` (devDependencies, versions dans `package.json` et le lock) | `npm ci` |

**Drivers Appium** : ce sont des `devDependencies` (Appium les reconnaît dans `node_modules/` en mode « projet », `APPIUM_HOME` non défini) : `npm ci` suffit, y compris après un `npm install` ou un déplacement du dépôt. Mettre à jour : `npm install -D appium-uiautomator2-driver@<version>` (idem `appium-xcuitest-driver`).

Les recettes `just` ne démarrent ni n'arrêtent aucun appareil, et n'ont aucune option `--device` : l'appareil visé se choisit par variables d'environnement (gabarit `.env`, surcharge ponctuelle `ANDROID_UDID=… just test-android …`).

- **iOS** : simulateur **iPhone 17 Pro**. `IOS_UDID` (colonne entre parenthèses de `xcrun simctl list devices`) le désigne ; XCUITest le démarre lui-même s'il est arrêté (mesuré le 2026-10-27 : démarrage en 6 à 10 s, session prête en 20 à 25 s, il reste démarré après le run). `IOS_DEVICE_NAME` (nom) ne suffit pas quand plusieurs runtimes portent le même nom : sans UDID, Appium peut créer un simulateur temporaire. `appium:shutdownOtherSimulators` n'est PAS activé (les autres simulateurs ne sont jamais arrêtés).
- **Android** : AVD de type Pixel, API 36. Soit l'émulateur tourne déjà (Android Studio ; `adb devices`) : `ANDROID_UDID` (numéro de série adb, ex. `emulator-5560`) ou `ANDROID_DEVICE_NAME` le désigne s'il y en a plusieurs ; soit `ANDROID_AVD=<nom d'AVD>` (`emulator -list-avds`) fait lancer l'AVD par Appium (mesuré le 2026-10-27 : session prête ~40 s après la demande) — l'émulateur s'arrête alors avec le run (il est enfant d'Appium) et l'app est désinstallée en fin de série. **Déconseillé pour des runs répétés** : chaque run repart d'un démarrage à froid, et `mobile_short` y a échoué dans la majorité des essais du 2026-10-27 (« Home non atteinte »), y compris avec un émulateur lancé à la main et testé aussitôt après son démarrage ; sur un émulateur déjà démarré depuis quelques minutes (Android Studio), il passe. `ANDROID_AVD_ARGS` ajoute des options à `emulator` (ex. `-port 5560 -no-snapshot-save`).
- Arrêter un appareil : `adb -s <série> emu kill`, `xcrun simctl shutdown <udid>` (ou les IDE).

### Apps mobiles à tester (variables `ANDROID_APP_PATH` et `IOS_APP_PATH`)

Les tests mobiles ne construisent rien : ils installent l'app que désignent deux variables d'environnement, **seule source du chemin** (le `justfile` n'en calcule aucun). Variable absente, ou chemin inexistant : l'erreur (de `src/driver/capabilities.ts`) nomme la variable.

| Plateforme | Construire l'app | Variable (exemple staging) |
|---|---|---|
| Android | Android Studio, ou `./gradlew assembleStagingDebug` dans `../ami-app-android` (préprod : `assemblePreprodDebug`) | `ANDROID_APP_PATH=../ami-app-android/app/build/outputs/apk/staging/debug/app-staging-debug.apk` |
| iOS | Xcode (scheme `AMI-Staging`, destination simulateur), ou `just build-staging` dans `../ami-app-ios` | `IOS_APP_PATH=~/Library/Developer/Xcode/DerivedData/AMI-xcodegen-<suffixe>/Build/Products/Debug-iphonesimulator/AMI-Staging.app` (le `<suffixe>` est propre à chaque poste : `ls ~/Library/Developer/Xcode/DerivedData`) |

Un chemin relatif se lit depuis la racine de ce projet ; `~/` désigne le dossier personnel ; aucun motif (`*`) n'est développé. `AMI_ENV` doit correspondre à l'app visée : il détermine l'identifiant de l'app (package `fr.gouv.ami.staging` ou `fr.gouv.ami.preprod`, bundle `fr.gouv.ami.staging` ou `fr.gouv.ami.preproduction`). Les valeurs d'exemple sont dans le gabarit `.env`.

Ports (facultatifs, utiles pour un second appareil en parallèle) : `ANDROID_APPIUM_PORT` (4723), `IOS_APPIUM_PORT` (4724), `ANDROID_SYSTEM_PORT` (8200), `ANDROID_CHROMEDRIVER_PORT` (9515), `IOS_WDA_PORT` (8100). L'appareil visé précisément : `ANDROID_UDID`, `ANDROID_DEVICE_NAME`, `IOS_UDID`, `IOS_DEVICE_NAME`.

### Fichiers d'environnement (`.env`, `.env.<cible>`)

`.env.example` est le gabarit commité (valeurs vides, aucun secret). Chaque poste le copie en **`.env`** (ignoré par git : votre environnement par défaut, ex. staging) et le remplit. WebdriverIO charge `.env` tout seul (`@wdio/cli` fait `import "dotenv/config"`), avec ou sans `just`. Pour une exécution contre un autre environnement, un fichier `.env.<cible>` (`.env.staging`, `.env.preprod`, tous ignorés par git) se choisit pour une commande :

```bash
just -E .env.preprod test-ios --suite mobile_short                                   # avec just (option native -E)
node --env-file=.env.preprod node_modules/.bin/wdio run wdio.ios.conf.ts --suite mobile_short   # sans just (option native de Node)
AMI_ENV=preprod IOS_APP_PATH=… just -E .env.preprod test-ios --suite mobile_short    # + surcharge ponctuelle d'une variable
```

Priorité (aucun chargeur n'écrase une variable déjà définie) : variable du shell, puis `.env.<cible>` choisi, puis `.env`. Une variable absente de `.env.<cible>` est donc complétée par `.env`. `--env-file` n'est pas accepté dans `NODE_OPTIONS` (Node le refuse) : il se place sur la commande `node`.

---

## Installation

```bash
cp .env.example .env         # puis remplir AMI_ENV et les variables NOTIF_*
npm ci                       # dépendances Node, dont Appium et ses drivers
just doctor                  # diagnostic de l'environnement (Node, Appium, SDK Android, simulateurs)
```

Hors CI, `.env` fournit `AMI_ENV` et les variables `NOTIF_*` (sans lui, le code lève une erreur qui nomme la variable manquante) — en CI, les
variables viennent du workflow GitHub Actions. Les comptes de test FranceConnect (maquette publique, sans secret) sont dans
`src/helpers/common/test-users.ts` ; leur `fcHash` est calculé (`src/helpers/common/fc-hash.ts`).

---

## Lancer les tests

```bash
just test-android                                    # tous les tests Android
just test-ios                                        # tous les tests iOS
just test-webapp                                     # tests webapp, Chrome visible
just test-webci                                      # tests webapp, headless (mode CI)
just test-android --spec "src/tests/mobile/notifications*"   # un ou plusieurs fichiers (`--spec` répétable, glob entre guillemets)
just test-android --suite mobile_all                 # suite nommée (`--suite` ; définies dans wdio.base.conf.ts : option native `suites`) — idem test-ios / test-webapp / test-webci
ANDROID_UDID=emulator-5560 just test-android --suite mobile_short   # appareil précis par variable d'environnement (ANDROID_UDID/ANDROID_AVD, IOS_UDID : voir Prérequis) ; tout le reste va à wdio
just test-webvideo --spec src/tests/webapp/agenda.parcours.test.ts   # webapp headless avec vidéo DevTools (au moins un --spec)
npx wdio run wdio.webapp.conf.ts --suite webapp_smoke   # appel natif d'une suite, sans just
just check-code                                       # lint + typecheck avant commit
just failures-text                                         # tests en échec du dernier run (dumps d'échec, chemin du transcript.md de la trace) ; le résumé JUnit est dans test-results/junit/
just failures-ui                                           # ouvre dans le lecteur DevTools la trace d'un test en échec (CIBLE et FILTRE facultatifs)
just clean-tests-data                                 # supprime .wdio, .wdio-logs et test-results/* (plusieurs Go)
```

> Les commandes utiles aux humains sont des cibles `just` documentées (`just --list`). Les outils sous-jacents (`npm`, `npx wdio`, `adb`, `xcrun`…) peuvent aussi être lancés directement.

---

## Architecture

```
wdio.base.conf.ts          config partagée (timeouts, reporters spec + JUnit, hooks)
wdio.android.conf.ts       capabilities Android + service Appium port 4723
wdio.ios.conf.ts           capabilities iOS + service Appium port 4724
wdio.webapp.conf.ts        capabilities Chrome (headless ou visible), pas de service Appium
src/
  driver/
    capabilities.ts        androidCapabilities / iosCapabilities
  platform/
    index.ts               platform() : PlatformAdapter — dispatch android/ios/webapp
  helpers/
    spa/                   spa.ts, selectors.ts, webview.ts : roleSelector(), clickButton(), waitForHeading()… (sélecteurs natifs WDIO 10)
    partner-api/           publishEvent() (retry 5xx), publishNotification/Demarche()
    reporting/             step(), failure-dump, sentry, traced, trace-redact, junit-clean, run-dir
    common/                environment, test-users, fc-hash, session
    webapp/                access-code, link-check
    mobile/                device-app, android-notifications, ios-notifications
  pages/
    *.page.ts              Page Objects — actions métier, sans sélecteurs
    locators/
      *.locators.ts        sélecteurs par plateforme + getXxxLocators()
  scripts/
    *.ts                   scripts CLI (failures-text, failures-ui)
  tests/
    mobile/*.test.ts        scénarios Mocha Android + iOS
    webapp/*.test.ts        scénarios Mocha webapp
docs/
  adr/                     décisions d'architecture (ADR)
```

### Principe de sélection des éléments

Les tests s'appuient sur deux couches : les **Page Objects** (`src/pages/*.page.ts`, actions
métier sans sélecteurs directs) et des **requêtes sémantiques** qui trouvent les éléments comme
un utilisateur les perçoit (rôle ARIA, texte visible, `accessibility id` en natif).

```
test (scénario)
  └── Page Object ("ouvrir l'inbox")
        └── clickButton / waitForHeading… (src/helpers/spa/spa.ts)  — sélecteurs natifs WDIO 10 (role/…, tag*=texte)
```

Le détail des conventions (POM 3 niveaux, sélecteurs natifs WDIO 10 vs `driver.execute()`, WebView
et contextes) est dans **[CONTRIBUTING.md](CONTRIBUTING.md)** — à lire avant d'écrire un test. Le
raisonnement complet derrière la règle de sélection (tableaux type de page × action) est archivé
dans l'ADR
[`docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`](docs/adr/2026-07-09-Strategie-de-selection-des-elements.md).

---

## Intégration continue

Un workflow réutilisable orchestre les suites de tests par plateforme (Android, iOS, webapp),
déclenché depuis les dépôts frères (backend, apps mobiles) sur pull request. Les résultats de
chaque plateforme (JUnit XML enrichi et dumps des échecs) sont publiés en un artefact par plateforme. Le job `report` de `workflow-e2e-main.yml` crée le check « e2e (ami-system-tests) » sur le commit testé et tient à jour UN commentaire sur la PR d'origine : tableau test | résultat | durée | lien Sentry des échecs (« écran natif » pour un échec natif), échecs en premier. Les jobs restent verts même si des tests échouent.

**Relances** : `specFileRetries` vaut 1 en CI (GitHub Actions pose `CI=true`) et 0 partout ailleurs, mesures comprises ; `WDIO_SPEC_FILE_RETRIES=N` ou `--specFileRetries=N` pour forcer. Un échec rejoué à l'identique en CI est un bug reproductible, un échec qui passe au 2e essai un test instable.

Ce que la CI lance correspond exactement aux suites nommées de `wdio.base.conf.ts` (option native `suites`, listes plates de specs ; `webapp_usage` + `mobile_all` sur PR, merge et tag, `webapp_short` / `mobile_short` en lancement manuel ; contenu et usage hors CI : CONTRIBUTING.md, « Suites nommées » ; `just test-android --suite …`, `test-ios`, `test-webapp`, `test-webci` avec le même argument) — reproduire
localement un run CI consiste à lancer la suite du même nom. Détail des workflows et décision
d'architecture : [`docs/adr/2026-08-04-Integration-continue-Github-Actions.md`](docs/adr/2026-08-04-Integration-continue-Github-Actions.md).

---

## Secrets

Les variables `AMI_ENV` (environnement backend ciblé) et `NOTIF_*` (clés API notifications) sont
dans `.env` à la racine — non commité. Voir `.env.example` pour les noms des variables à renseigner.

---

## Contribuer

### Ajouter un test

1. Explorer l'écran avec `just explore-webapp|android|ios` (puis `just s <cible> snapshot -i` ; le DOM d'une WebView mobile s'inspecte avec les DevTools)
2. Créer ou compléter les locators dans `src/pages/locators/`
3. Créer ou compléter le Page Object dans `src/pages/`
4. Écrire le scénario dans `src/tests/mobile/` ou `src/tests/webapp/` selon la cible
5. Valider : `just check-code` puis `just test-android --spec "src/tests/mobile/MonTest*"`

### Guidelines

Les règles générales (Page Objects, sélection des éléments, WebView, assertions, isolation,
retry, rapports, débogage) sont toutes dans **[CONTRIBUTING.md](CONTRIBUTING.md)**. Les cas
particuliers (un seul écran, une seule méthode) sont documentés en commentaire directement dans
le fichier de code concerné plutôt que dans un fichier séparé.

Le raisonnement détaillé (tableaux page × action) derrière la règle de sélection résumée dans
CONTRIBUTING.md §2 est archivé dans l'ADR
[`docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`](docs/adr/2026-07-09-Strategie-de-selection-des-elements.md).

Avant d'écrire ou de modifier un test, prendre aussi en compte les skills WDIO sous
`.claude/skills/` (voir [CLAUDE.md](CLAUDE.md#skills-vs-règles-du-projet)) et leur contexte projet
mis en cache dans `.webdriverio-skills/` (conventions, environnement) : ce cache évite de
redécouvrir à chaque session des éléments déjà établis, mais peut devenir obsolète. Un constat de
désynchronisation entre ce cache (ou le modèle applicatif reconstruit) et l'état réel observé
d'une des apps (webapp, Android ou iOS) est en soi un critère pour le rafraîchir — via
`managing-project-customizations` pour le contexte projet, ou `reconstructing-app-model` pour le
modèle applicatif — indépendamment d'un échec de test constaté.

### Explorer et déboguer avec `wdio session` (WebdriverIO 10)

Les apps hybrides ont deux arbres d'éléments distincts (natif XCUITest/UIAutomator2 et DOM web) :
sans observation directe, impossible de savoir dans quel contexte on est ni quelle est la structure
réelle. Les règles de fond (ne jamais commiter un locator non validé, etc.) sont dans
[CONTRIBUTING.md](CONTRIBUTING.md). Une session `wdio session` survit à la commande qui l'a ouverte
(arrêt après 30 min d'inactivité) : on enchaîne de petites commandes, sans relancer l'app.

| Je veux… | Commande |
|---|---|
| Ouvrir une session sur la webapp, Android ou iOS | `just explore-webapp "/#/agenda"` · `just explore-android` · `just explore-ios` (l'appareil doit déjà tourner : Android Studio / Xcode) |
| Lire la page : éléments interactifs, avec refs | `just s <cible> snapshot -i` · `just s <cible> find "texte"` |
| Agir sur une ref, et voir ce que l'action a changé | `just s <cible> click e3` · `just s <cible> fill e4 "valeur"` |
| Inspecter le DOM de la WebView (mobile) | les DevTools (Chrome `chrome://inspect` pour Android, Safari > Développement pour iOS) — en Android hybride, `snapshot` lit l'arbre natif et plante après `contexts switch` (WDIO 10.0.1) |
| Voir les contextes, basculer | `just s <cible> contexts` · `just s <cible> contexts switch WEBVIEW_…` |
| Lire les erreurs console ou les appels réseau (web) | `just s <cible> logs --errors` · `just s <cible> requests` |
| Transformer les étapes en test | `just explore-export <nom> <cible>` → `exports/<nom>.e2e.ts` (à ranger dans un Page Object) |
| Figer un test à son échec et l'inspecter | `just debug-webapp <spec>` (mobile : `npx wdio run wdio.android.conf.ts --spec <spec> --debug=agent`, idem iOS) puis `just s debug-0-0 snapshot -i`, `screenshot`, `resume` |
| Lister les sessions ouvertes (dont un test en pause : `debug-0-0`) | `npx wdio session list` |
| Diagnostiquer la machine | `just doctor` (les ✖ cloud et desktop sont sans objet) |
| Fermer | `just explore-close <cible>` |

Points à connaître :
- **Natif d'abord.** Après `just explore-android` ou `just explore-ios`, l'app est sur le sélecteur d'environnement
  (écran natif, sans WebView). Il faut choisir une tuile (`just s <cible> snapshot`, puis un clic)
  pour charger la SPA ; `contexts` échoue tant qu'il n'existe aucune WebView.
- **`just debug-webapp`** (ou `--debug=agent` sur mobile) se met en pause au premier échec d'un *test* ; un échec de *hook* (`before all`)
  ne déclenche pas la pause.
- **Webapp** : la route d'une page est `/#/agenda` (hash). Le cookie d'accès est posé sans jamais
  afficher la clé.
- **iOS** : ne jamais appeler `driver.switchContext('NATIVE_APP')` au milieu du flow FranceConnect
  (voir [CONTRIBUTING.md §4](CONTRIBUTING.md#4-webview-et-contextes)). Si une liste est vide alors que
  la page est rendue (arbre d'accessibilité périmé après un redirect), relancer l'observation.
- Les commandes directes (`npx wdio session …`) fonctionnent aussi ; le skill
  `.claude/skills/wdio-session/SKILL.md` décrit toutes les actions.

Avant toute session de débogage, regarder les dumps du dernier run (`just failures-text` : captures, DOM, étapes, identifiants Sentry au
moment de l'échec) et `.wdio-logs/appium-android.log` / `appium-ios.log`.

**Autres outils utiles** : `chrome://inspect/#devices` dans Chrome inspecte visuellement la WebView
Android ; **Appium Inspector** (app desktop), connecté sur `localhost:4724`, inspecte le contexte natif
iOS. `logLevel: 'debug'` dans `wdio.base.conf.ts` affiche chaque commande Appium — à ne pas commiter.

### Débogage webapp

Pendant un run `just test-webapp` (Chrome visible), ne pas ouvrir les DevTools ni poser de
breakpoint sur l'onglet testé — la commande WebDriver en cours bloque jusqu'au timeout de garde
(`ENSURE_APP_WINDOW_TIMEOUT_MS`, 20 s, dans `src/platform/browser.adapter.ts`). Utiliser
`console.log` + `just test-webci` (headless) pour un diagnostic sans interaction manuelle sur l'onglet.

### Docs utiles

- [les démarches de DN](https://docs.numerique.gouv.fr/docs/1ce135fb-6fb3-4ff5-a53e-27f3670dbd8e/)
- [Les recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)
- [Reconstruction du modèle applicatif](docs/process/reconstruction-modele-applicatif.md) — process pour remettre à jour le modèle des écrans (webapp + natif Android/iOS) après une évolution des apps

### Scénarios restant à faire

- [ ] écrans de toute première connexion (après suppression des données via la cli scalingo)
- [ ] Paramétrer les zones scolaires et constater l'ajout et suppression d'éléments dans le calendrier (on les enlève tous, le calendrier est vide, on en remet un, ce n'est pas vide (autour de Noël, on remet toutes les zones d'origine))
- [ ] Sur android constater le fonctionnement des notifications push native (login en refusant, notif envoyée, on les accepte, notif envoyée et vue en push)
- [ ] Agenda : élections et auto-promo OTV, ... c'est fluctuant selon les dates, a tester en auto ?
- [ ] Teste de démarche utilisant OTV 
- [ ] le reste du [cahier de recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)

