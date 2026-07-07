# Tests E2E — AMI

Suite de tests système mobiles (iOS + Android) pour l'application AMI.
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
cp .env.example .env.local   # puis remplir les variables NOTIF_*
just setup                   # npm install + drivers Appium, may not work on non mac os
just check                   # vérifier que les outils sont présents
```

---

## Lancer les tests

```bash
just test-android                          # tous les tests Android
just test-ios                              # tous les tests iOS
just test-android "src/tests/home*"        # un fichier spécifique (glob)
just test-android-grep Notifications       # filtrer par nom de describe/it
just check-code                            # lint + typecheck avant commit
just open-report                           # rapport Allure du dernier run
```

> Toutes les commandes passent par `just`. Ne jamais appeler directement `npm`, `npx`, `adb`, `xcrun` ou `appium`.

---

## Architecture

```
wdio.base.conf.ts          config partagée (timeouts, reporters Allure, hooks)
wdio.android.conf.ts       capabilities Android + service Appium port 4723
wdio.ios.conf.ts           capabilities iOS + service Appium port 4724
src/
  driver/
    capabilities.ts        androidCapabilities / iosCapabilities
  helpers/
    webview.ts             withWebView(), tl(), refreshAxTree()
    notifications-api.ts   publishNotification() avec retry 5xx
  pages/
    *.page.ts              Page Objects — actions métier, sans sélecteurs
    locators/
      *.locators.ts        sélecteurs par plateforme + getXxxLocators()
  tests/
    *.test.ts              scénarios Mocha (BDD)
docs/
  guidelines/              documentation détaillée des patterns (voir ci-dessous)
```

### Principe de sélection des éléments

Les tests s'appuient sur deux couches :

1. **Page Objects** (`src/pages/*.page.ts`) — actions métier sans sélecteurs directs
2. **Requêtes sémantiques** — trouvent les éléments comme un utilisateur les perçoit

```
test (scénario)
  └── Page Object ("ouvrir l'inbox")
        └── tl().getByRole / findByText  — élément par rôle ARIA ou texte visible
```

En WebView (SPA Svelte), les éléments sont cherchés par leur **sens**, pas leur structure DOM :

```typescript
// Résistant aux refactos CSS/layout
const bell = await tl().getByRole('link', { name: /notifications/i })
const item = await tl().findByText(title, {}, { timeout: 20000 })
```

Pour les rares éléments **natifs** (hors WebView — boutons système, dialogs OS), les locators sont spécifiques à la plateforme et passent par `getXxxLocators()` :

```typescript
// iOS : accessibilityIdentifier SwiftUI
$('~franceConnect button')
// Android : resource-id
$('~franceConnect button')  // si le même id est posé des deux côtés
```

---

## Secrets

Les variables `NOTIF_*` (clés API notifications) sont dans `.env.local` à la racine — non commité.
Voir `.env.example` pour les noms des variables à renseigner.

---

## Contribuer

### Ajouter un test

1. Inspecter l'écran avec `just inspect` (ou `just inspect /ma-route`)
2. Créer ou compléter les locators dans `src/pages/locators/`
3. Créer ou compléter le Page Object dans `src/pages/`
4. Écrire le scénario dans `src/tests/`
5. Valider : `just check-code` puis `just test-android "MonTest"`

### Guidelines

Documentation détaillée des patterns et décisions d'architecture dans `docs/guidelines/` :

| Fichier | Sujet |
|---------|-------|
| `semantic-locators.md` | Testing Library en WebView, `accessibility id` en natif |
| `cross-platform-page-objects.md` | POM 3 niveaux : tests → pages → locators |
| `webview-context-switching.md` | `withWebView()` seul autorisé |
| `webview-quirks.md` | `refreshAxTree()`, scriptTimeout iOS, `executeAsync` |
| `oidc-redirect-handling.md` | Flow FranceConnect complet |
| `assertion-quality.md` | `waitUntil`, interdiction `browser.pause` |
| `test-isolation.md` | `terminateApp`/`activateApp`, décision `before`/`beforeEach` |
| `spa-navigation.md` | Navigation SPA hybride, pull-to-refresh, tab switching |
| `retry-strategies.md` | `specFileRetries` vs `mochaOpts.retries` |
| `debugging-workflow.md` | inspect → run → commit |
| `interactive-debugging.md` | Boucle `browser.debug()` + `listInteractive()` |
| `allure-reporting.md` | `addStep`, `addFeature`, `addSeverity`, `addAttachment` |

### Workflow de débogage

```bash
just inspect              # explorer l'écran courant en live
just inspect /suivi       # naviguer vers une route puis inspecter
# → repérer les accessibility ids ou textes → mettre à jour les locators
just test-android-grep "MonTest"   # relancer uniquement ce scénario
```

### Docs utiles

- [les démarches de DN](https://docs.numerique.gouv.fr/docs/1ce135fb-6fb3-4ff5-a53e-27f3670dbd8e/)
- [Les recettes](https://docs.numerique.gouv.fr/docs/26b382cc-68fd-4a80-be43-dd3eb4bd102c/)

### Scénarios restant à faire

- [ ] écrans de toute première connexion (après suppression des données via la cli scalingo)
- [ ] Paramétrer les zones scolaires et constater l'ajout et suppression d'éléments dans le calendrier (on les enlève tous, le calendrier est vide, on en remet un, ce n'est pas vide (autour de Noël, on remet toutes les zones d'origine))
- [ ] Sur android constater le fonctionnement des notifications push native (login en refusant, notif envoyée, on les accepte, notif envoyée et vue en push)
- [ ] Agenda : élections et auto-promo OTV, ... c'est fluctuant selon les dates, a tester en auto ?
- [ ] Teste de démarche utilisant OTV 