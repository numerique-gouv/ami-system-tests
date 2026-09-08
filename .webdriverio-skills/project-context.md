# Contexte projet — ami-system-tests

_Dernière mise à jour : 2026-09-08_

## Résumé

Tests E2E WebdriverIO v9 + Appium 3 + TypeScript pour l'app AMI (mobile Android/iOS + webapp Chrome). Toutes les commandes passent par `just` (jamais `npm`/`npx`/`adb`/`xcrun`/`appium` directement).

## Modèle du site testé (déjà construit — ne pas re-scanner)

Un modèle de la webapp cible existe déjà : **`references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.{md,json}`** (miroir : `.webdriverio-skills/website-analysis.{md,json}`), produit par le skill `analyze-website` le 2026-09-08 à partir d'une exploration live du site + lecture du code des dépôts frères (`ami-notifications-api/public/mobile-app`, `ami-app-android`, `ami-app-ios`).

Résumé exploitable directement par les autres skills :
- **Navigation** : 5 sections (Accueil `/`, Agenda `/#/agenda`, Services `/#/services`, Suivi `/#/followup`, Plus — modale)
- **Fonctionnalités `high`** : authentification FranceConnect, cycle de vie d'une démarche (`new`→`wip`→`closed`, route détail `/#/followup/item/{partner_id}/{item_type}/{item_external_id}`), notifications in-app (`/#/notifications`)
- **Fonctionnalités `medium`** : Profil usager (`/#/profile`, 3 blocs identité/contact/adresse), Services (annuaire/démarches partenaires)
- **Fonctionnalités `low`/`unknown`** : Agenda, Préférences (Suivi des démarches / Notifications / Zones scolaires — cette dernière section n'est pas couverte par la suite mobile actuelle, écart de couverture à considérer)
- **Zones d'ombre documentées** : détail de `AMIGoto`, relation consentement API vs toggles UI, mécanisme du bug de concurrence iOS (réaffichage écran FranceConnect), destination du bouton "Gérer" de l'inbox

Avant toute tâche de planification de test (`creating-test-structure`) ou d'investigation (`gathering-context`, `investigate-failing-tests`) touchant à la webapp, lire ce modèle plutôt que de ré-explorer le site. Le rafraîchir via `analyze-website` seulement si la structure du site a changé depuis.

## Configuration WDIO

| Fichier | Rôle |
|---|---|
| `wdio.base.conf.ts` | config partagée : `waitforTimeout` 15000ms, `connectionRetryTimeout` 120000ms, `connectionRetryCount` 3, `mochaOpts.timeout` 120000ms (24h si `WDIO_DEBUG=1`), `specFileRetries` 0, reporters `spec` + `allure` (`outputDir: allure-results`, `addConsoleLogs: true`) |
| `wdio.android.conf.ts` | capabilities Android, service Appium port 4723 |
| `wdio.ios.conf.ts` | capabilities iOS, service Appium port 4724 |
| `wdio.webapp.conf.ts` | capabilities Chrome, `baseUrl` dérivée de `AMI_ENV` via `resolveEnvironment()`, pas de service Appium |
| `test-suites.ts` | suites nommées consommées via `WDIO_SUITE` : `all`, `short`, `CI` (auth+notifications+demarches+profile), `auth`, `api` (notifications+demarches) |

⚠️ **`allure-results/` et `.wdio-logs/*.log` ne sont jamais nettoyés automatiquement avant un run** (pas de `rm -rf` dans le justfile avant `test-*`) — les résultats/captures/logs Appium s'accumulent entre runs et entre plateformes (android/ios/webapp partagent le même `outputDir`). Un rapport Allure généré sans nettoyage préalable peut mélanger plusieurs jours/plateformes. Voir `health-recommendations.md`.

## Scripts npm pertinents

```
test:android / test:ios / test:webapp       — wdio run <conf>
test:android:staging / test:ios:staging     — idem avec APP_ENV=staging
lint / lint:fix                             — eslint src --ext .ts
typecheck                                   — tsc --noEmit
appium:install / appium:update / appium:start
report                                      — rm -rf allure-report && allure generate + open
open-report                                 — allure open (sans régénérer)
```
Mais l'usage prescrit passe par `just` (voir CLAUDE.md racine) — ces scripts npm sont encapsulés par le justfile, ne pas les appeler directement.

### Correspondance skills du pack tiers → commandes `just`

Certains skills du pack `klamping/webdriverio-skills` (ex. `running-webdriverio-tests`) prescrivent des commandes génériques (`npx wdio`, `wdio.conf.js`, `--suite=...`) qui ne s'appliquent pas telles quelles ici — ce projet interdit `npm`/`npx`/`appium` en direct (CLAUDE.md) et a 4 configs `wdio.*.conf.ts` + des suites définies dans `test-suites.ts` (pas dans une propriété `suites` de config WDIO). Table de correspondance à utiliser avant d'exécuter une commande suggérée par un skill :

| Prescription générique du pack | Équivalent AMI |
|---|---|
| `npx wdio` | `just test-android` / `just test-ios` / `just test-webapp` / `just test-webci` |
| `npx wdio --spec=<f>` | `just test-android "<glob>"` (idem `test-ios`/`test-webapp`) |
| `npx wdio --suite=<s>` | `just test-android-suite <s>` (suite définie dans `test-suites.ts`, lue via `WDIO_SUITE`) |
| `wdio.conf.js` | `wdio.base.conf.ts` (partagé) + `wdio.{android,ios,webapp}.conf.ts` (par plateforme) |
| lint/typecheck générique | `just check-code` |
| génération de rapport | `just open-report` (ou `just report` pour régénérer) |
| exploration DOM/inspection | `just inspect` |

## Conventions de code (lint)

- ESLint flat config (`eslint.config.js`), `@typescript-eslint/recommended` + règles renforcées :
  - `no-unused-vars` (sauf préfixe `_`)
  - `explicit-function-return-type` (warn)
  - `no-floating-promises` (error) — cohérent avec la règle projet "await uniquement devant expect(wdioElement) ou promesses"
  - `no-console` (warn) — utiliser `@wdio/logger` (`logger('nom')`) plutôt que `console.*`
- `tsconfig.json` définit un alias `@pages` (voir `paths`) utilisé dans certains imports (`@pages/profile.page`, `@pages/suivi-demarches.page`).

## Helpers/API custom notables

| Fichier | Rôle |
|---|---|
| `src/helpers/webview.ts` | `tl()` (Testing Library sur WebView), `retourJusquATexteVisible()` (navigation retour avec timeout local 10s, indépendant du réseau) |
| `src/helpers/notifications-api.ts` | Client HTTP API partenaire (`checkConsent`, `grantConsent`, `publishNotification` avec retry sur 5xx). **Timeout de requête ajouté le 2026-09-08** (`REQUEST_TIMEOUT_MS = 15000`, via `AbortSignal.timeout()`) suite à une investigation de flakiness liée à une coupure réseau — avant ce fix, un `fetch()` bloqué remontait jusqu'au timeout Mocha du hook englobant (120-180s), causant des cascades de hooks en échec. |
| `src/helpers/environment.ts` | `resolveEnvironment()` — dérive `webappUrl`/`apiUrl` depuis `AMI_ENV` (numérique → review app PR, sinon staging) |
| `src/helpers/access-code.ts` | gestion du code d'accès webapp (`WEB_APP_ACCESS_KEYS`, gate `window.prompt` côté staging) |
| `src/helpers/traced.ts` | wrapper des singletons Page Object (`traced(new XxxPage(), 'XxxPage')`) |
| `src/pages/authenticate.process.ts` | `getAppToStartingState()` — séquence FranceConnect avec re-détection d'écran, retry borné (`MAX_ATTEMPTS`), timeouts dédiés (`AUTHENTICATE_TIMEOUT_MS` 60000, `FINAL_HOME_TIMEOUT_MS` 15000) |

## Variables d'environnement (noms uniquement — jamais de valeurs)

`AMI_ENV`, `ANDROID_DEVICE_NAME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `IOS_DEVICE_NAME`, `RUN_OLD_DEVICE`, `WDIO_DEBUG`, `WEBAPP_HEADLESS`, `WEB_APP_ACCESS_KEYS`, `NOTIF_PARTNER_ID`, `NOTIF_PARTNER_SECRET` (les deux derniers via `requireEnv()` dans `notifications-api.ts`, jamais loggés).

Rappel projet : ne jamais lire `.env.local` ni afficher ses valeurs, y compris via un outil.

## Serveurs / environnements cibles

- **staging** (défaut) : `https://ami-back-staging.osc-fr1.scalingo.io` — sert à la fois la webapp et l'API partenaire
- **review app PR** : `AMI_ENV` contenant un nombre → `https://ami-back-staging-pr{N}.osc-fr1.scalingo.io`
- Android tourne sur le port Appium **4723**, iOS sur **4724** (évite les conflits) ; webapp n'a pas de service Appium (Chromedriver direct).

## Voir aussi

- `custom-rules.md` — règles d'équipe (sélecteurs, garde-fous)
- `health-recommendations.md` — recommandations d'amélioration détectées
- `references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md` — modèle détaillé du site
