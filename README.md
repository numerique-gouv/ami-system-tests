# Tests E2E — AMI

Suite de tests système mobiles (iOS + Android) et webapp (Chrome) pour l'application AMI.
Les scénarios couvrent les parcours utilisateurs complets : authentification FranceConnect, notifications push, démarches, etc.

**Stack** : WebdriverIO v9 + Appium 3 + TypeScript

---

## Prérequis

| Outil | Installation |
|-------|-------------|
| Node.js ≥ 22.19 (LTS 24, cf. `.nvmrc`) | [nodejs.org](https://nodejs.org) |
| `just` | `brew install just` |
| Android SDK + `adb` | Android Studio → SDK Manager |
| Xcode + `xcodegen` | App Store + `brew install xcodegen` |
| Appium (global) | `npm i -g appium` |

Simulateur iOS attendu : **iPhone 17 Pro** (ou définir `IOS_SIMULATOR` dans `.env.local`)
Émulateur Android : AVD de type Pixel, API 36 — nom configurable via `ANDROID_DEVICE_NAME` dans `.env.local`

---

## Installation

```bash
cp .env .env.local           # puis remplir AMI_ENV et les variables NOTIF_*
just setup                   # npm install + drivers Appium, may not work on non mac os
just check                   # vérifier que les outils sont présents
```

Hors CI, `.env.local` est obligatoire (garde-fou `_require-dotenv` dans le `justfile`) — en CI, les
variables viennent du workflow GitHub Actions. Pour les comptes de test FranceConnect, copier
`src/helpers/test-users.local.example.ts` en `src/helpers/test-users.local.ts` (non commité, comme `.env.local`).

---

## Lancer les tests

```bash
just test-android                                    # tous les tests Android
just test-ios                                        # tous les tests iOS
just test-webapp                                      # tests webapp, Chrome visible
just test-webci                                       # tests webapp, headless (mode CI)
just test-android "src/tests/mobile/notifications*"   # un ou plusieurs fichiers (glob)
just test-android-suite CI                            # suite nommée (test-suites.ts) — idem test-ios-suite / test-webapp-suite / test-webci-suite
just check-code                                       # lint + typecheck avant commit
just open-report                                      # rapport Allure du dernier run
just clean-install                                    # réinstallation propre (rm node_modules + npm ci)
just upgrade                                          # met à jour les dépendances (npm-check-updates)
just push-notification <login> [titre]                # publie une notification de test via l'API
```

> Les commandes utiles aux humains sont des cibles `just` documentées (`just --list`). Les outils sous-jacents (`npm`, `npx wdio`, `adb`, `xcrun`…) peuvent aussi être lancés directement.

---

## Architecture

```
wdio.base.conf.ts          config partagée (timeouts, reporters Allure, hooks)
wdio.android.conf.ts       capabilities Android + service Appium port 4723
wdio.ios.conf.ts           capabilities iOS + service Appium port 4724
wdio.webapp.conf.ts        capabilities Chrome (headless ou visible), pas de service Appium
test-suites.ts             suites nommées (WDIO_SUITE) + resolveSpecs()
src/
  driver/
    capabilities.ts        androidCapabilities / iosCapabilities
  platform/
    index.ts               platform() : PlatformAdapter — dispatch android/ios/webapp
  helpers/
    spa.ts / dom-query.ts  findRole(), clickButton(), waitForHeading()… (recherche par rôle ARIA)
    webview.ts             describeCurrentPage()
    notifications-api.ts   publishNotification() avec retry 5xx
  pages/
    *.page.ts              Page Objects — actions métier, sans sélecteurs
    locators/
      *.locators.ts        sélecteurs par plateforme + getXxxLocators()
  scripts/
    *.ts                   scripts CLI lancés via just (push-notification)
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
        └── findRole / findText (src/helpers/spa.ts)  — élément par rôle ARIA ou texte visible
```

Le détail des conventions (POM 3 niveaux, `findRole()` vs `$()`/`$$()` vs `driver.execute()`, WebView
et contextes) est dans **[CONTRIBUTING.md](CONTRIBUTING.md)** — à lire avant d'écrire un test. Le
raisonnement complet derrière la règle de sélection (tableaux type de page × action) est archivé
dans l'ADR
[`docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`](docs/adr/2026-07-09-Strategie-de-selection-des-elements.md).

---

## Intégration continue

Un workflow réutilisable orchestre les suites de tests par plateforme (Android, iOS, webapp),
déclenché depuis les dépôts frères (backend, apps mobiles) sur pull request. Les résultats Allure de
chaque plateforme sont fusionnés en un rapport unique, commenté sur la PR d'origine.

Ce que la CI lance correspond exactement aux suites nommées de `test-suites.ts` (`just
test-android-suite`, `test-ios-suite`, `test-webapp-suite`, `test-webci-suite`) — reproduire
localement un run CI consiste à lancer la suite du même nom. Détail des workflows et décision
d'architecture : [`docs/adr/2026-08-04-Integration-continue-Github-Actions.md`](docs/adr/2026-08-04-Integration-continue-Github-Actions.md).

---

## Secrets

Les variables `AMI_ENV` (environnement backend ciblé) et `NOTIF_*` (clés API notifications) sont
dans `.env.local` à la racine — non commité. Voir `.env` pour les noms des variables à renseigner.

---

## Contribuer

### Ajouter un test

1. Explorer l'écran avec `just explore <cible>` (puis `just s <cible> snapshot -i`, `just webview <cible>`)
2. Créer ou compléter les locators dans `src/pages/locators/`
3. Créer ou compléter le Page Object dans `src/pages/`
4. Écrire le scénario dans `src/tests/mobile/` ou `src/tests/webapp/` selon la cible
5. Valider : `just check-code` puis `just test-android "MonTest"`

### Guidelines

Les règles générales (Page Objects, sélection des éléments, WebView, assertions, isolation,
retry, Allure, débogage) sont toutes dans **[CONTRIBUTING.md](CONTRIBUTING.md)**. Les cas
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
| Ouvrir une session sur la webapp, Android ou iOS | `just explore webapp "/#/agenda"` · `just explore android` · `just explore ios` (l'appareil doit déjà tourner : `just start-android` / `just start-ios`) |
| Lire la page : éléments interactifs, avec refs | `just s <cible> snapshot -i` · `just s <cible> find "texte"` |
| Agir sur une ref, et voir ce que l'action a changé | `just s <cible> click e3` · `just s <cible> fill e4 "valeur"` |
| Lister le DOM de la WebView (mobile) | `just webview <cible>` — en Android hybride, `snapshot` lit l'arbre natif et plante après `contexts switch` (WDIO 10.0.1) |
| Voir les contextes, basculer | `just s <cible> contexts` · `just s <cible> contexts switch WEBVIEW_…` |
| Lire les erreurs console ou les appels réseau (web) | `just s <cible> logs --errors` · `just s <cible> requests` |
| Transformer les étapes en test | `just explore-export <nom> <cible>` → `exports/<nom>.e2e.ts` (à ranger dans un Page Object) |
| Figer un test à son échec et l'inspecter | `just debug <cible> <spec>` puis `just s debug-0-0 snapshot -i`, `screenshot`, `resume` |
| Diagnostiquer la machine | `just doctor` (les ✖ cloud et desktop sont sans objet) |
| Fermer | `just explore-close <cible>` |

Points à connaître :
- **Natif d'abord.** Après `just explore android|ios`, l'app est sur le sélecteur d'environnement
  (écran natif, sans WebView). Il faut choisir une tuile (`just s <cible> snapshot`, puis un clic)
  pour charger la SPA ; `contexts` échoue tant qu'il n'existe aucune WebView.
- **`just debug`** se met en pause au premier échec d'un *test* ; un échec de *hook* (`before all`)
  ne déclenche pas la pause.
- **Webapp** : la route d'une page est `/#/agenda` (hash). Le cookie d'accès est posé sans jamais
  afficher la clé.
- **iOS** : ne jamais appeler `driver.switchContext('NATIVE_APP')` au milieu du flow FranceConnect
  (voir [CONTRIBUTING.md §4](CONTRIBUTING.md#4-webview-et-contextes)). Si une liste est vide alors que
  la page est rendue (arbre d'accessibilité périmé après un redirect), relancer l'observation.
- Les commandes directes (`npx wdio session …`) fonctionnent aussi ; le skill
  `.claude/skills/wdio-session/SKILL.md` décrit toutes les actions.

Avant toute session de débogage, regarder le dernier rapport Allure (`just open-report`, captures au
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

