# Tests E2E — AMI

Suite de tests système mobiles (iOS + Android) et webapp (Chrome) pour l'application AMI.
Les scénarios couvrent les parcours utilisateurs complets : authentification FranceConnect, notifications push, démarches, etc.

**Stack** : WebdriverIO v9 + Appium 3 + TypeScript + Testing Library

---

## Prérequis

| Outil | Installation |
|-------|-------------|
| Node.js ≥ 20 | [nodejs.org](https://nodejs.org) |
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

> Toutes les commandes passent par `just`. Ne jamais appeler directement `npm`, `npx`, `adb`, `xcrun` ou `appium`.

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
    webview.ts             tl(), retourJusquATexteVisible()
    notifications-api.ts   publishNotification() avec retry 5xx
  pages/
    *.page.ts              Page Objects — actions métier, sans sélecteurs
    locators/
      *.locators.ts        sélecteurs par plateforme + getXxxLocators()
  scripts/
    *.ts                   scripts CLI lancés via just (inspect-webview, push-notification)
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
        └── tl().getByRole / findByText  — élément par rôle ARIA ou texte visible
```

Le détail des conventions (POM 3 niveaux, `tl()` vs `$()`/`$$()` vs `driver.execute()`, WebView
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

1. Inspecter l'écran avec `just inspect`
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

### Workflow de débogage : observer avant d'écrire

Les apps hybrides ont deux arbres d'éléments distincts (natif XCUITest/UIAutomator2 et DOM web) :
sans observation directe, impossible de savoir dans quel contexte on est ni quelle est la
structure réelle. Les règles de fond (ne jamais commiter un locator non validé, etc.) sont dans
[CONTRIBUTING.md](CONTRIBUTING.md).

1. **Inspecter** l'écran avant d'écrire un sélecteur :
   ```bash
   just inspect   # liste les éléments interactifs de la WebView courante
   ```
   La cible auto-détecte la plateforme via le seul appareil connecté (émulateur Android ou
   simulateur iOS déjà démarré).
2. **Tester** un sélecteur sur un scénario isolé plutôt que sur tout le fichier :
   ```bash
   just test-android "src/tests/mobile/notifications.test.ts"
   ```
3. **Consigner** uniquement ce qui a été vérifié : commiter avec un message qui explique le
   *pourquoi* (bug WKRDP, AX tree périmé, etc.), pas juste le sélecteur qui « devrait marcher ».

Avant toute session de débogage, regarder le dernier rapport Allure (`just open-report`,
screenshots au moment de l'échec) et `.wdio-logs/appium-android.log` / `appium-ios.log`.

### Débogage interactif : `browser.debug()` + REPL

Le cycle « modifier un locator → relancer `just test-android` » coûte ~60 s (boot émulateur,
install, login FranceConnect, navigation) ; trouver le bon sélecteur prend souvent 3 à 5 cycles.
`browser.debug()` suspend le test en cours et ouvre un REPL Node dans la session Appium **vivante** :
`browser`, `driver`, `$`, `$$` sont disponibles, plus des helpers projet (`listInteractive`,
`listInteractiveAll`, `inWebContext`, `webViewInfo`, `refreshAxTree`, `getContexts`,
`saveScreenshot`). Taper `help()` dans le REPL pour la liste à jour.

```bash
# App déjà buildée et installée, émulateur/simulateur démarré
just build-android && just start-android   # ou build-ios / start-ios

export WDIO_DEBUG=1   # désactive le timeout Mocha (2 min par défaut) — sans ça le REPL se fait tuer
```

```typescript
// Dans src/tests/, test scratch qui navigue jusqu'à l'écran à explorer puis se suspend
it('debug — explorer la page notifications', async () => {
  await authenticate()
  await NotificationsInboxPage.openFromHome()
  await browser.debug()  // ← suspend ici, le REPL s'ouvre dans le terminal
})
```

```bash
WDIO_DEBUG=1 just test-android "debug — explorer"
```

Dans le REPL :

```js
> help()                                          // liste des helpers disponibles
> await getContexts()                             // ['NATIVE_APP', 'WEBVIEW_fr.gouv.ami.staging']
> await listInteractive()                         // éléments natifs du contexte courant
> await listInteractiveAll()                      // natif puis webview en un seul appel
> await inWebContext(async () => await listInteractive())  // éléments de la WebView
> await webViewInfo()                             // { url, visible: 'visible'|'hidden', title }
> await $('~Notifications').click()               // tester un locator natif
> await inWebContext(async () => {                // tester un locator WebView
    const el = await tl().findByRole('link', { name: /Notifications/i })
    await el.click()
  })
> await saveScreenshot('inbox-empty')             // → /tmp/inbox-empty.png
> .exit                                           // ou Ctrl-C deux fois
```

Recopier les locators validés dans `src/pages/locators/*.locators.ts` — jamais un locator non
testé dans le REPL ou en run complet.

**Autres outils utiles** : `chrome://inspect/#devices` dans Chrome pendant une session
`browser.debug()` inspecte visuellement la WebView Android. **Appium Inspector** (app desktop),
connecté sur `localhost:4724`, inspecte le contexte natif iOS. `logLevel: 'debug'` dans
`wdio.base.conf.ts` affiche chaque commande Appium — à ne pas commiter. `wdio repl` (CLI
standalone) est déconseillé pour AMI : il faudrait redéclarer toutes les capabilities à la main, et
l'app ne serait pas dans son état post-login — toujours préférer `browser.debug()` dans un test scratch.

Sur iOS, ne jamais appeler `driver.switchContext('NATIVE_APP')` au milieu du flow FranceConnect —
voir [CONTRIBUTING.md §4](CONTRIBUTING.md#4-webview-et-contextes). Si `listInteractive()` retourne
une liste vide en WebView alors que la page est visuellement rendue (AX tree iOS périmé après un
redirect), appeler `await refreshAxTree()` puis relister.

### Débogage webapp

Pendant un run `just test-webapp` (Chrome visible), ne pas ouvrir les DevTools ni poser de
breakpoint sur l'onglet testé — la commande WebDriver en cours bloque jusqu'au timeout de garde
(`ENSURE_APP_WINDOW_TIMEOUT_MS`, 20 s, dans `src/platform/browser.adapter.ts`). Utiliser
`console.log` + `just test-webci` (headless) pour un diagnostic sans interaction manuelle sur l'onglet.

### Docs utiles

- [les démarches de DN](https://docs.numerique.gouv.fr/docs/1ce135fb-6fb3-4ff5-a53e-27f3670dbd8e/)
- [Les recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)

### Scénarios restant à faire

- [ ] écrans de toute première connexion (après suppression des données via la cli scalingo)
- [ ] Paramétrer les zones scolaires et constater l'ajout et suppression d'éléments dans le calendrier (on les enlève tous, le calendrier est vide, on en remet un, ce n'est pas vide (autour de Noël, on remet toutes les zones d'origine))
- [ ] Sur android constater le fonctionnement des notifications push native (login en refusant, notif envoyée, on les accepte, notif envoyée et vue en push)
- [ ] Agenda : élections et auto-promo OTV, ... c'est fluctuant selon les dates, a tester en auto ?
- [ ] Teste de démarche utilisant OTV 
- [ ] le reste du [cahier de recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)

