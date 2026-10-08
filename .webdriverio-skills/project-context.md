# Contexte projet — ami-system-tests

_Dernière mise à jour : 2026-09-08_

## Résumé

Tests E2E WebdriverIO v9 + Appium 3 + TypeScript pour l'app AMI (mobile Android/iOS + webapp Chrome). Toutes les commandes passent par `just` (jamais `npm`/`npx`/`adb`/`xcrun`/`appium` directement).

## Modèle du site testé (déjà construit — ne pas re-scanner)

Un modèle de la webapp cible existe déjà : **`references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.{md,json}`** (miroir : `.webdriverio-skills/website-analysis.{md,json}`), reconstruit le **2026-10-02** (remplace celui du 2026-09-08 ; écrans natifs inchangés depuis le 2026-09-08) par le skill `analyze-website` à partir d'une exploration live du site + lecture du code des dépôts frères (`ami-notifications-api/public/mobile-app`, `ami-app-android`, `ami-app-ios`).

Résumé exploitable directement par les autres skills :
- **Navigation** : 5 `<button>` (Accueil `/`, Agenda `/#/agenda`, Services `/#/services`, Suivi `/#/followup`, Plus — dialogue à 6 entrées : profil, préférences, aide et contact, données personnelles, accessibilité, déconnexion). **Aucun `<a href>` interne : tout est `button`.**
- **Fonctionnalités `high`** : authentification FranceConnect + onboarding de 1re connexion (`/welcome/zones` → `/welcome/notifications`), cycle de vie d'une démarche (`new`→`wip`→`closed`, détail `/#/followup/item/{partner}/{type}/{id}`), notifications in-app (`/#/notifications`), navigation + menu Plus
- **Fonctionnalités `medium`** : Profil (`/#/profile`), Services (onglets, 5 checklists, fiches partenaires), Préférences (consentements, notifications, zones), Aide/contact/pages légales
- **Fonctionnalités `low`** : Agenda, pages d'erreur ; prototypes `/step*` (non confirmé)
- **Pièges de sélection constatés (2026-10-02)** : le **nom accessible peut différer du texte visible** (« Supprimer » = aria-label « Cacher l'élément de l'agenda », « Gérer » = « Gérer les notifications ») ; la salutation « Bonjour {prénom} » est un `<h1>` ; le carrousel d'accueil (Splide) ne rend accessible qu'une carte à la fois ; les listes de Services se chargent après les titres de section ; l'encart des archivés est un accordéon fermé
- **Zones d'ombre documentées** : effets d'« Archiver »/« Supprimer », destinations externes (changement d'adresse, OTV depuis Services, 17cyber), `AMIGoto`, relation consentement API vs cases UI

Avant toute tâche de planification de test (`creating-test-structure`) ou d'investigation (`gathering-context`, `investigate-failing-tests`) touchant à la webapp, lire ce modèle plutôt que de ré-explorer le site. Le rafraîchir via `analyze-website` seulement si la structure du site a changé depuis.

## Configuration WDIO

| Fichier | Rôle |
|---|---|
| `wdio.base.conf.ts` | config partagée : `waitforTimeout` 15000ms, `connectionRetryTimeout` 120000ms, `connectionRetryCount` 3, `mochaOpts.timeout` 120000ms, `specFileRetries` 0, reporters `spec` + `junit` (`outputDir: test-results/junit`) ; hook `afterTest` : dump d'échec dans `test-results/failures/` |
| `wdio.android.conf.ts` | capabilities Android, service Appium port 4723 |
| `wdio.ios.conf.ts` | capabilities iOS, service Appium port 4724 |
| `wdio.webapp.conf.ts` | capabilities Chrome, `baseUrl` dérivée de `AMI_ENV` via `resolveEnvironment()`, pas de service Appium |
| `test-suites.ts` | suites nommées consommées via `WDIO_SUITE` : `all`, `short`, `CI` (auth+notifications+demarches+profile), `auth`, `api` (notifications+demarches) |

⚠️ **`test-results/` et `.wdio-logs/*.log` ne sont jamais nettoyés automatiquement avant un run** (pas de `rm -rf` dans le justfile avant `test-*`) — les résultats/captures/logs Appium s'accumulent entre runs et entre plateformes (android/ios/webapp partagent le même `outputDir`). Un rapport Allure généré sans nettoyage préalable peut mélanger plusieurs jours/plateformes. Voir `health-recommendations.md`.

## Scripts npm pertinents

```
test:android / test:ios / test:webapp       — wdio run <conf>
test:android:staging / test:ios:staging     — idem avec APP_ENV=staging
lint / lint:fix                             — eslint src --ext .ts
typecheck                                   — tsc --noEmit
appium:install / appium:update / appium:start
failures                                    — liste les tests en échec du dernier run (dumps d'échec)
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
| exploration DOM/inspection | `just explore <cible>` puis `just s <cible> snapshot -i` · `just webview <cible>` |

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
| `src/helpers/spa.ts` | primitives communes aux Page Objects de la SPA : `clickButton`, `waitForHeading`, `waitForButtons`, `clickButtonInDialog`, `visibleButtonTexts`, `pageText`, `checkboxStates` (toutes par nom accessible / DOM visible) |
| `src/pages/navigation.page.ts` | barre basse, menu Plus (`openPlusEntry`), navigation par route (`goToRoute`) — partagé par tous les Page Objects « onglet » |
| `src/pages/onboarding-{passkey,zones,notifications}.page.ts` | écrans d'onboarding : clé d'accès, zones scolaires (`/welcome/zones`), notifications (natif sur mobile, `/welcome/notifications` en webapp) |
| `src/helpers/traced.ts` | wrapper des singletons Page Object (`traced(new XxxPage(), 'XxxPage')`) |
| `src/pages/authenticate.process.ts` | `getAppToStartingState()` — séquence FranceConnect avec re-détection d'écran, retry borné (`MAX_ATTEMPTS`), timeouts dédiés (`AUTHENTICATE_TIMEOUT_MS` 60000, `FINAL_HOME_TIMEOUT_MS` 15000) |

## Variables d'environnement (noms uniquement — jamais de valeurs)

`AMI_ENV`, `ANDROID_DEVICE_NAME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `IOS_DEVICE_NAME`, `RUN_OLD_DEVICE`, `WEBAPP_HEADLESS`, `WEB_APP_ACCESS_KEYS`, `NOTIF_PARTNER_ID`, `NOTIF_PARTNER_SECRET` (les deux derniers via `requireEnv()` dans `notifications-api.ts`, jamais loggés).

Rappel projet : ne jamais lire `.env.local` ni afficher ses valeurs, y compris via un outil.

## Serveurs / environnements cibles

- **staging** (défaut) : `https://ami-back-staging.osc-fr1.scalingo.io` — sert à la fois la webapp et l'API partenaire
- **review app PR** : `AMI_ENV` contenant un nombre → `https://ami-back-staging-pr{N}.osc-fr1.scalingo.io`
- Android tourne sur le port Appium **4723**, iOS sur **4724** (évite les conflits) ; webapp n'a pas de service Appium (Chromedriver direct).

## Voir aussi

- `custom-rules.md` — règles d'équipe (sélecteurs, garde-fous)
- `health-recommendations.md` — recommandations d'amélioration détectées
- `references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md` — modèle détaillé du site

## Tests webapp (`src/tests/webapp/`) — état au 2026-10-02

12 fichiers, un par parcours usager : `authentication`, `navigation`, `accueil`, `agenda`, `services`, `suivi`, `notifications`, `profil`, `preferences`, `aide-contact`, `deconnexion`, `erreurs`. Chaque fichier s'authentifie seul (`getAppToStartingState()`), les actions mutantes (profil, déconnexion) restaurent l'état en `after()`. Les liens sortants (service-public.gouv.fr, demarche.numerique.gouv.fr) ne sont jamais suivis : seule leur présence est testée.

Commandes utiles : `just test-webci` (tous, headless), `just test-webapp "<glob>"` (Chrome visible). Chrome pour les tests webapp est choisi et téléchargé par WDIO 10 dans `.cache/` (aucun épinglage : ni `.chrome-version` ni recette `update-chrome`). Pour un script d'exploration long (> 120 s)`this.timeout()` dans un `it` n'est pas pris en compte).
