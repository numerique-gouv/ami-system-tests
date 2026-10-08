# Contribuer aux tests E2E AMI

Ce document rassemble les **règles générales** à suivre pour écrire ou modifier un test. Pour installer, lancer les tests ou déboguer, voir le [README](README.md). Les cas particuliers (un seul écran, une seule méthode concernée) ne sont **pas** ici : ils sont documentés en commentaire directement dans le fichier de code concerné.

Avant d'appliquer ces règles, prendre en compte les skills WDIO du projet (`.claude/skills/`, voir
[CLAUDE.md](CLAUDE.md#skills-vs-règles-du-projet)) et leur contexte mis en cache dans
`.webdriverio-skills/` : ce cache peut contenir des conventions ou un état du modèle applicatif
déjà établis. S'il diverge de l'état réel observé d'une des apps (webapp, Android ou iOS), cette
désynchronisation constatée est en elle-même un critère pour relancer `reconstructing-app-model`
sur cette app, indépendamment d'un échec de test.

## Sommaire

1. [Page Objects — architecture 3 niveaux](#1-page-objects--architecture-3-niveaux)
    - [1bis. Logging](#1bis-logging)
2. [Sélection des éléments](#2-sélection-des-éléments)
3. [Attendre sa page, puis agir](#3-attendre-sa-page-puis-agir)
4. [WebView et contextes](#4-webview-et-contextes)
5. [Qualité des assertions](#5-qualité-des-assertions)
6. [Isolation des tests](#6-isolation-des-tests)
7. [Stratégies de retry](#7-stratégies-de-retry)
8. [Erreurs de test vs erreurs techniques](#8-erreurs-de-test-vs-erreurs-techniques)
9. [Rapports Allure](#9-rapports-allure)
10. [Règles de débogage](#10-règles-de-débogage)

---

## 1. Page Objects — architecture 3 niveaux

```
src/tests/mobile/    scénarios Mocha Android + iOS — zéro sélecteur, zéro if(driver.isIOS)
src/tests/webapp/    scénarios Mocha webapp — même contrainte
src/pages/           Page Objects — logique métier, dispatch via getXxxLocators()
src/pages/locators/  sélecteurs par plateforme + fonction getXxxLocators()
```

### Niveau 1 — `locators/*.locators.ts`

Un fichier par page. Une interface TypeScript des locators, un objet `androidXxxLocators`, un objet `iosXxxLocators`, une fonction `getXxxLocators()` qui dispatche selon `driver.isIOS`.

```typescript
export const androidLoginLocators: LoginLocators = {
    fcButton: '~franceConnect button', // accessibility id Android
    fcButtonInWebView: false,
}
export const iosLoginLocators: LoginLocators = {
    // Sélecteur `button=` : matching exact, pas de regex possible — apostrophe typographique
    // `’` (U+2019) copiée depuis le texte réel de la SPA, pas l'apostrophe droite du clavier.
    fcButton: "button=S’identifier avec FranceConnect",
    fcButtonInWebView: true, // le bouton est dans la WebView SPA sur iOS
}

export function getLoginLocators(): LoginLocators {
    return driver.isIOS ? iosLoginLocators : androidLoginLocators
}
```

**Exception : locators identiques sur les deux plateformes.**
Quand une page est entièrement en WebView avec un DOM identique iOS/Android, exporter un seul objet partagé plutôt que deux objets dupliqués — `getXxxLocators()` reste la seule API appelée par le Page Object, même si elle ne dispatche plus rien.
**Ne pas fusionner par anticipation** : si un seul champ diverge un jour, repasser au dual-object plutôt que d'ajouter un `driver.isIOS ? ... : ...` ponctuel dans l'objet partagé.

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur direct** — appel à `getXxxLocators()` à chaque méthode.
- Les éléments de la SPA (WebView/webapp) s'atteignent par les primitives de `src/helpers/spa.ts` (`clickRole`, `waitForRole`, `fillByLabel`…), appelées dans le Page Object, **pas** par un sélecteur dans le fichier locators (rôle + nom accessible n'ont de sens qu'en WebView).
- Exporté comme singleton tracé : `export default traced(new XxxPage(), 'XxxPage')`.
- `if (driver.isIOS)` acceptable **seulement** quand le *comportement d'interaction* diffère vraiment (pas juste le sélecteur) — ex. submit de formulaire OIDC (fallback `driver.execute` sur iOS pour le bug WKRDP, inutile sur Android), clic JS vs pointer events, attente post-redirect.
- **Avant d'écrire un branchement plateforme**, chercher si un signal DOM/WebView commun couvre déjà les deux cas (ex. la disparition d'une modale de confirmation est un événement observable identiquement sur iOS et Android — pas besoin de détecter la fin d'un logout différemment par plateforme).
- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'page-object'`), voir
  [§1bis Logging](#1bis-logging).

### Niveau 3 — `tests/*.test.ts`

Appelle uniquement des méthodes de Page Object. Le test se lit comme un scénario métier, sans détail d'implémentation ni sélecteur.

- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'test'`), voir
  [§1bis Logging](#1bis-logging).

---

## 1bis. Logging

**Jamais `console.*`** dans le code qui tourne dans une session WDIO/Mocha (pages, tests, helpers appelés par ce code, hooks de config) — utiliser `@wdio/logger`, qui s'intègre au flux de logs WDIO/Allure (`addConsoleLogs: true` dans
`wdio.base.conf.ts`) :

```typescript
import logger from '@wdio/logger'

const log = logger('<namespace>')
```

N'ajouter cette constante que dans les fichiers qui l'utilisent réellement — `no-unused-vars` est une erreur de lint, pas un avertissement.

Un namespace par couche, tous activés à `'info'` dans `logLevels` (`wdio.base.conf.ts`) même quand le niveau global est
`'warn'` :

| Couche                                                          | Namespace     |
|-----------------------------------------------------------------|---------------|
| `pages/*.page.ts` (via `traced()`)                              | `page-object` |
| Hooks globaux `wdio.base.conf.ts`                               | `scenario`    |
| `tests/*.test.ts`                                               | `test`        |
| `helpers/*-api.ts` (clients HTTP)                               | `api`         |
| `wdio.android.conf.ts` / `wdio.ios.conf.ts` / `wdio.webapp.conf.ts` (`onPrepare`, etc.) | `config`      |
| Autres `helpers/*.ts` appelés en session                        | `helper`      |

**Exception : scripts CLI hors session de test.** `src/scripts/*.ts` (lancés via `just` en dehors d'une suite WDIO, ex. `push-notification.ts`) restent en `console.*` : `@wdio/logger` n'apporte rien hors du flux WDIO, et cette sortie est un affichage terminal direct, pas un log de scénario.

---

## 2. Sélection des éléments

**Par défaut, sélectionner par le sens perçu par l'utilisateur**, pas par la structure DOM :

- **WebView / webapp** — par rôle + nom accessible, via les primitives de `src/helpers/spa.ts`. Deux familles : celles qui **ouvrent le contexte** (`clickRole`, `waitForRole`, `clickButton`, `waitForHeading`, `fillByLabel`…), utilisables directement depuis un Page Object ; et les primitives **nues** (`findRole`, `findRoles`, `queryRole`, `findTestId`, `findLabel`, `findText`), à appeler dans un `platform().inWebContext()` déjà ouvert quand l'élément trouvé est réutilisé (attribut, saisie, plusieurs actions).
- **Natif** (hors WebView) — `accessibility id` (`~xxx`) de préférence à un XPath par texte ou un resource-id brut.

### Ordre de préférence

1. **Les primitives `spa.ts`** (`WaitOptions {timeout, interval}`) — elles réessaient jusqu'à trouver : c'est *le* mécanisme d'attente, il n'y a rien à enrouler dans une boucle (cf. §7). Augmenter `timeout` (ou régler `interval`) plutôt que d'ajouter un retry.
2. **Les API WDIO indépendantes de la plateforme**, sur un élément déjà obtenu : `.click()`, `.getText()`, `.isSelected()`, `waitForClickable()`… Elles fonctionnent en natif comme en WebView — elles survivront à la « promotion » d'une page de la SPA en écran natif.
3. **`driver.execute()`** — dernier recours : c'est du JavaScript, donc **uniquement valable dans une WebView / webapp**, inutilisable le jour où l'écran devient natif. Un `driver.execute` doit porter un commentaire qui dit pourquoi les primitives `spa.ts` et les API WDIO ne suffisent pas.

- **Testing Library (`tl()`) est retiré du projet** : `@testing-library/webdriverio` n'est plus maintenu (dernière release 3.2.1, janvier 2023 ; la PR de compatibilité WDIO 9 est restée ouverte, `within()` est cassé sous WDIO 9). Ne plus importer `setupBrowser`, ne plus écrire `tl()`, `findBy*`, `getBy*`, `queryBy*` ni `within()`.
- **Pas de `get*` sans attente** : toute primitive attend le rendu (le `getBy*` immédiat échouait dès que le rendu n'était pas terminé). Seule exception assumée : `queryRole`, qui ne réessaie pas et retourne `null` — pour un cas où l'absence est légitime (carte non atteignable dans un carrousel, dialogue qui doit avoir disparu).
- **Agrégats** (liste de textes, états de cases à cocher) : primitives `spa.ts` existantes (`visibleButtonTexts`, `checkboxStates`). Pour cibler dans un dialogue : `clickButtonInDialog` (sélecteur WDIO `aria/…` depuis l'élément dialogue).
- Besoin non couvert : **ajouter une primitive dans `src/helpers/spa.ts`** plutôt que d'écrire un sélecteur dans le Page Object.
- **Comment ça marche** (`src/helpers/dom-query.ts`) : chaque tentative est un seul `browser.execute` qui cherche et marque l'élément (`data-wdio-pick`), puis l'élément est récupéré par ce marqueur. Le rôle est résolu par balise ou attribut `role`, les éléments non accessibles (masqués, `aria-hidden`, `inert`) sont exclus, et le nom est celui de `aria-labelledby`, `aria-label`, du texte visible ou de `title`. Le nom accepte un **texte exact ou une RegExp** (vérifié le 2026-10-07 sur Chrome, WebView Android et WKWebView iOS). `aria/…` de WDIO n'est **pas** utilisé pour cela : c'est un XPath à égalité stricte, sans RegExp ni filtre de rôle. Un échec lève une `AssertionError` qui liste les candidats vus.

### `data-testid` : dernier recours documenté

Avant d'ajouter un `data-testid`, essayer `clickRole`/`waitForRole`/`waitForPageText` (rôle, nom, texte) et ne basculer que si cette requête échoue **réellement**. Documenter alors l'échec observé en commentaire à côté du champ (pas « structure observée via l'inspection »). Deux cas justifiés : rôle+nom dupliqués sur la page, ou texte imprévisible (contenu dynamique).

### Classes CSS : DSFR oui, Svelte hashé non

Les classes du design system État (`fr-tile__content`, `fr-badge`, `fr-tabs__tab--selected`) sont un contrat stable, utilisables comme sélecteur — après `data-testid` si une requête sémantique ne suffit pas. Les classes générées par Svelte (`svelte-19k7n5y`) changent à chaque build : **jamais** comme sélecteur.

### Apostrophe dans un texte matché : regex avec `.`, jamais de caractère littéral

Les primitives par texte ou libellé (`waitForPageText`, `fillByLabel`) font un matching **exact** par défaut quand on leur passe une chaîne. Le contenu FR (DSFR, Svelte) utilise souvent l'apostrophe typographique `’` (U+2019), alors qu'on tape naturellement `'` (U+0027) — visuellement quasi identiques en review, donc l'erreur casse le test au runtime (`Champ de libellé "Nom d'usage" introuvable après …ms. Candidats vus : [...]`). Préférer une regex avec `.` :

```typescript
await fillByLabel(/Nom d.usage/, newValue)   // `.` matche `'` comme `’`
```

Cas sans regex possible (sélecteur WDIO natif `button=`…) : copier l'apostrophe exacte depuis le DOM rendu (`just webview <cible>` ou `just s <cible> find`), jamais la retaper, et documenter le caractère en commentaire (ex. `franceconnect-mire.locators.ts`).

### Écran natif

Ni les primitives `spa.ts` ni `driver.execute()` n'ont de prise sur les éléments natifs XCUITest/UiAutomator2 : `$()` avec des sélecteurs natifs y est **obligatoire**, pas un choix de style. Ne pas `await` le `$()` lui-même — il se re-résout à chaque commande et résiste aux changements de navigation.

```typescript
const tile = $(loc.pickerTile)
await tile.waitForClickable({timeout: 15000})
await tile.click()
```

Le raisonnement détaillé du choix d'API (historique) est archivé dans l'ADR `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`.

---

## 3. Attendre sa page, puis agir

Même modèle que `docs/process/model/spec.md` (§3.3 et §4.2) : **un écran se vérifie lui-même ; une action source ne vérifie jamais sa destination.**

1. **Chaque méthode publique d'un Page Object commence par s'assurer qu'elle est sur sa page** — une attente (`waitForHeading`, `waitForRole`) avec `timeout` sur le titre (`heading`) ou le rôle de l'élément qu'elle va utiliser. Jamais via `window.location.hash` (le hash peut changer avant que le contenu soit rendu).
2. **Une méthode qui navigue ne connaît pas la page suivante** : elle clique (ou fixe la route) et rend la main. Les Page Objects ne s'importent pas entre eux (hors `NavigationPage` et les helpers). L'arrivée est vérifiée par la page cible, via une méthode d'identité `assertDisplayed()` ; quand le titre est dynamique, il est passé en argument (`DemarcheDetailPage.assertDisplayed(title)`). Le scénario enchaîne les deux, ce qui se lit comme un parcours :

   ```typescript
   await HomePage.openAllEvents()
   await AgendaPage.assertDisplayed()
   ```

   Faire retourner à la méthode de navigation le Page Object cible est une solution de dernier recours (dépendances circulaires entre pages) : à éviter tant qu'elle n'est pas nécessaire.
3. **Par défaut, on ne vérifie pas qu'une action est terminée** : le clic est supposé pris en compte, la page suivante vérifiera son arrivée. C'est une **exception** qui demande une preuve — un clic dont la perte est établie (re-rendu concurrent). La postcondition porte alors sur la **page d'origine** (`clickButtonUntilGone` : le bouton disparaît), jamais sur la page suivante ; on n'observe pas le réseau.
4. **Page au contenu imprévisible** (services du catalogue) : vérifier seulement que ce n'est pas une page d'erreur.
5. **Donnée asynchrone** : une page abonnée au temps réel (accueil, inbox de notifications via WebSocket) se met à jour en place — attendre simplement avec une primitive `spa.ts`. Une page sans abonnement (Suivi) ne se met à jour qu'au chargement : recharger entre deux essais avec un backoff (référence : `SuiviDemarchesPage.waitForDemarche`).
6. **Ne pas vérifier la disparition d'un composant** après une action : les pages se recyclent, la résolution d'un élément disparu génère des warnings bénins **et attend la durée du timeout**.

### Cas nominal et écarts : le Page Object décrit la cible, les écarts sont des anomalies visibles

L'app est testée sur des contextes **modernes** (appareil et OS récents) **et anciens** (vieil appareil, vieil OS, surcouche constructeur). Le comportement attendu est le même partout ; quand il ne l'est pas, c'est une **anomalie**, pas une variante normale.

- **Le code d'un Page Object suit le parcours nominal** : la cible. Exemple : **un seul tap** sur « S'identifier avec FranceConnect ».
- **Un écart (appareil ancien contre moderne, WebView, surcouche constructeur, état résiduel…) est écrit dans le code du Page Object**, par une branche **explicite et facultative**, pour qu'il saute aux yeux en revue. Elle porte :
  1. un **commentaire** qui sépare ce qui est **constaté** (appareil, version, date) de ce qui n'est qu'une **hypothèse** ;
  2. un **`log.warn('ANOMALIE …')`** émis **quand elle se déclenche**, pour que le journal du test la montre ;
  3. une attente **courte** et une absence **sans effet** : un appareil conforme à la cible ne doit jamais échouer à cause d'elle.
- **Ne pas cacher un écart** dans un fichier de locators ou de configuration (ils décrivent le chemin nominal : sélecteurs, contexte) ni le traiter en silence (`log.info`, ou rien) : il deviendrait une variante « normale » que plus personne ne remet en cause.
- **Une branche d'écart est temporaire** : quand l'app est corrigée, on la supprime ; le `warn` dit si elle sert encore.

Exemples du dépôt : le 2e tap FranceConnect sur Android (`FranceConnectMirePage.tapFranceConnect`), l'onboarding des notifications affiché en natif au lieu de la route SPA sur Android (`OnboardingNotificationsPage.isOnboardingVisible`), la WebView restée sur `/?is_logged_out` après une déconnexion (`FranceConnectMirePage.reloadSpaRootIfLoggedOut`).

### Squelette d'une page WebView

```typescript
await clickRole('button', 'Modifier')                       // attend la page, puis agit
await fillByLabel(/Nom d.usage/, 'Nouvelle valeur')
await clickRole('button', 'Enregistrer', {timeout: 5000})
```

---

## 4. WebView et contextes

Le point de couplage Appium/mobile (bascule de contexte, gestes natifs, dispatch iOS/Android) est isolé derrière `PlatformAdapter` (`src/platform/types.ts`), avec une implémentation par plateforme : `appiumAdapter` (Android/iOS) et `browserAdapter` (webapp). `platform()` retourne la bonne selon `browser.isMobile`.

```typescript
interface PlatformAdapter {
    readonly kind: 'android' | 'ios' | 'webapp'
    readonly fcButtonIsNative: boolean   // true sur Android seulement

    inWebContext<T>(callback: () => Promise<T>): Promise<T>
    isWebContextAvailable(): Promise<boolean>
    refreshAxTree(): Promise<void>       // no-op hors iOS
    pullToRefresh(): Promise<void>
}
```

- **`platform().inWebContext()` est la seule façon d'atteindre le DOM de la SPA** — jamais `driver.switchContext()` directement. Sur mobile, il bascule `NATIVE_APP` → `WEBVIEW_*` et garantit le retour en `NATIVE_APP` dans un `finally`, même en cas d'exception. Sur webapp, il est quasi-identité. **Ne pas imbriquer** deux `inWebContext()` : le `finally` du second rebascule en natif et casse la suite du premier (d'où les méthodes « bare » à appeler dans un contexte déjà ouvert).
- Les sélecteurs CSS/XPath ne fonctionnent qu'en `WEBVIEW_*` (mobile) ; les gestes natifs (swipe, pull-to-refresh) et les sélecteurs natifs ne fonctionnent qu'en `NATIVE_APP`. Un geste natif **ne doit jamais** être appelé depuis l'intérieur d'un `inWebContext()`.
- **Flow OIDC FranceConnect : un seul `platform().inWebContext()`** pour tout le flow (eIDAS → identifiants → callback). Cas particulier : sortir du contexte WebView au milieu de *ce flow précis* provoque un blocage ~25 s sur iOS.
- **Naviguer par un vrai clic utilisateur** (`clickRole(…)`, ou `$(sel).click()` après `waitForClickable()`) plutôt que `driver.execute(() => el.click())` — le clic JS est silencieux sur iOS en cas d'échec.
- **Les éléments ne survivent pas à un switch de contexte** : toute interaction WebView se fait dans `platform().inWebContext()`, pas avec les matchers WDIO natifs.

---

## 5. Qualité des assertions

La qualité d'une assertion se mesure au message produit en cas d'échec.

```typescript
// ✅ La valeur réelle apparaît dans le message d'échec
expect(title).not.toBe('')
expect(version).toMatch(/\d+\.\d+/)
expect(newTop).toEqual(expectedTitle)

// ❌ Seul le fait d'être non-vide/typé est vérifié — valeur cachée
expect(title.length).toBeGreaterThan(0)
expect(typeof enabled).toBe('boolean')
```

- **`await` devant `expect`** uniquement quand `expect` reçoit un élément WDIO (matcher qui retourne une Promise) :
  `await expect($(loc)).toBeDisplayed()`. Jamais devant une valeur déjà résolue (`string`/`boolean`/`number`) — ça déclenche l'avertissement TypeScript `[80007]` et n'a aucun effet.
- **`waitUntil` : toujours passer `timeoutMsg`.** Sans lui, le rapport Allure ne montre qu'un cryptique « Timeout exceeded ».
- **Asserter une absence via `waitUntil`, jamais par un check immédiat** — après une action qui change l'état, la SPA a besoin d'un cycle de rendu ; un check immédiat produit souvent un faux positif (l'élément est encore dans le DOM).
- **Fusionner les vérifications séquentielles sur un même item.** Dès qu'un scénario doit vérifier N critères sur le même élément/la même liste, écrire une seule méthode de Page Object qui les vérifie tous dans le même `waitUntil`, avec une variable d'état (`failReason`) qui capture jusqu'où l'attente est allée avant d'échouer — pas N méthodes à un seul critère chacune (deux sources de flakiness au lieu d'une, et un message d'échec qui ne dit pas lequel des deux critères a échoué).
- **Ne pas doubler `waitForDisplayed` et `isDisplayed`** — `waitForDisplayed`/`waitForVisible`
  garantit déjà l'affichage ; un `isDisplayed()` qui suit immédiatement est redondant.

---

## 6. Isolation des tests

Deux niveaux d'isolation : entre fichiers de spec et entre `it()` d'un même fichier (`before` vs
`beforeEach`, à choisir).

L'isolation entre fichiers de spec dépend du mode de lancement. Avec `just test-android`/`test-ios`/
`test-webapp` (globs) ou hors suite nommée, chaque fichier obtient une session fraîche, automatiquement.
Avec les suites nommées (`just test-android-suite <nom>`, `WDIO_SUITE`, voir `test-suites.ts`), les
fichiers d'un même groupe **partagent** une session Appium — le login OIDC n'est payé qu'une fois
pour le groupe. Un test qui modifie l'état global doit en tenir compte : ne pas supposer une session
fraîche du seul fait d'être dans un nouveau fichier.

```
Les tests modifient l'état ?
  ├── oui et reset bon marché (terminateApp) → beforeEach
  └── non ou reset coûteux (login OIDC)     → before + cleanup explicite (after)
```

- **`before`** : navigation coûteuse faite une seule fois (onboarding, login OIDC ~30 s). Convient si les tests ne modifient pas l'état global, ou si un test qui échoue ne pollue pas les suivants.
- **`beforeEach`** : reset strict avant chaque test. Convient dès qu'un test modifie l'état de l'app, ou que l'onboarding doit être rejoué. `driver.reset()` est **déprécié** dans Appium 3 — utiliser
  `terminateApp` + `activateApp` (conserve l'installation, reset l'état mémoire) ou `fullReset: true`
  en capability pour une réinstallation complète.
- **Indépendance des `it()` : règle absolue.** Chaque `it()` doit pouvoir s'exécuter dans n'importe quel ordre et en isolation. Un `it()` qui modifie l'état doit le remettre dans l'état initial (dans le test lui-même, ou dans
  `afterEach`).
- **Exception documentée : cycle de vie d'une entité backend.** Quand des `it()` testent les états successifs d'une même entité côté API (`new → wip → closed`), la dépendance entre `it()` est structurelle. Dans ce cas : documenter explicitement la dépendance en commentaire du `describe` ; utiliser un identifiant unique horodaté ; chaque `it()`
  publie ses propres notifications et valide son état sans supposer l'état *local de l'app* laissé par le `it()`
  précédent ; vérifier que
  `specFileRetries` rejoue bien tout le fichier (nouvelle session → `before` rejoué), pas un `it()`
  isolé.
- **Un test ne fait jamais `xcrun simctl` ni `adb` directement.** Il s'appuie sur l'environnement préparé par `just`
  (émulateur/simulateur démarré, app installée, hook `beforeSession` côté Android). Ça garantit la portabilité (CI, machines différentes) et centralise la chaîne de préparation dans le `justfile`.
- **Idempotence backend** : un test qui publie des données (notification, post) doit utiliser un identifiant/titre unique horodaté (`` `AMI-vanilla-${Date.now()}` ``) — sinon un backend qui fait un
  `get_or_create` sur le payload retourne le record d'un run précédent au lieu d'en créer un nouveau.

---

## 7. Stratégies de retry

Trois niveaux, à ne pas confondre :

| Niveau          | Mécanisme               | Session Appium              | Quand l'utiliser                               |
|-----------------|-------------------------|-----------------------------|------------------------------------------------|
| **Spec**        | `specFileRetries`       | Fraîche (nouveau processus) | Instabilité environnement (simulateur, réseau) |
| **Applicatif**  | Retry dans le code      | Conservée                   | API tiers cold-start (5xx transitoires)        |
| **Page Object** | `try/catch` dans le POM | Conservée                   | Élément instable post-redirect                 |

- **Éviter `mochaOpts.retries`.** Il relance le `it()` dans la **même** session Appium : l'état de l'app peut être corrompu (onboarding à moitié passé, token expiré), les logs Appium du premier essai restent dans le même flux (Allure ne peut pas distinguer les tentatives), et un bug réel qui passe au 2e essai devient invisible. `specFileRetries`
  relance le fichier entier dans un nouveau processus avec une session fraîche et des logs propres par tentative.
- **Retry applicatif** (backend cold-start type Scalingo/Heroku) : retry sur 5xx uniquement, jamais sur 4xx (erreur client, non transitoire).
- **Retry court en Page Object** (élément instable qui réapparaît brièvement, ex. bouton FranceConnect en fin de redirect OIDC) : le `catch` best-effort **ne doit jamais être totalement silencieux** — logger avec `log.warn()` (voir §1, jamais `console.warn`) conditionné au cas attendu documenté. Un
  `catch {}` vide masque un vrai bug (sélecteur cassé, timeout réseau) derrière un « comportement normal ».
- **Ne pas retrier les primitives `spa.ts`** — elles intègrent déjà une attente interne (`WaitOptions {timeout, interval}`). Augmenter ce timeout plutôt que d'enrouler l'appel dans une boucle de retry manuelle.

- **Ne pas corriger chaque échec temporaire.** Un échec isolé dû à l'infrastructure (bac à sable FranceConnect, émulateur, réseau) ou à un parcours différent parce qu'une session/des cookies traînent d'un tir sur l'autre ne justifie pas un correctif de code. Corriger sur récurrence mesurée (campagne de stabilité), avec une cause établie.

En débogage, mettre `specFileRetries: 0` (voir la vraie cause plutôt que le retry qui la masque).

---

## 8. Erreurs de test vs erreurs techniques

Deux catégories d'échec, à ne jamais mélanger dans le type d'exception levée :

| Catégorie            | Signification                                                                                                           | Type levé                                                                                                                                                         |
|----------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Erreur de test**   | L'application n'a pas fait ce qu'on attendait d'elle (le test s'est exécuté correctement, le résultat observé est faux) | Librairie d'assertion (`expect(...).toXxx()`) ou, hors contexte `expect-webdriverio` (boucle de polling manuelle, réponse HTTP), `AssertionError` (`node:assert`) |
| **Erreur technique** | Le test n'a pas pu s'exécuter (infra, environnement, configuration — rien à voir avec le comportement de l'application) | `Error`                                                                                                                                                           |

- **Pourquoi la distinction compte** : `@wdio/allure-reporter` classe chaque échec en `failed` (rouge) ou
  `broken` (jaune) selon que le message/stack de l'exception contient `"expect"` ou commence par
  `"AssertionError"`. Lever le bon type au bon endroit rend le rapport Allure directement actionnable :
  `failed` → suivre un bug applicatif ; `broken` → réparer le test ou l'environnement, pas l'application.
- **`expect(...).toXxx()` reste le premier choix** dès qu'un matcher `expect-webdriverio` existe pour le cas — il lève déjà le bon type en interne. `AssertionError` explicite est réservé aux échecs métier qui ne passent pas par un
  `expect()` : sortie d'une boucle de backoff (`waitForDemarche`,
  `assertNotificationReceived`), réponse HTTP inattendue d'une API partenaire (`publishNotification`), élément de confirmation attendu absent.
- **`throw new Error(...)` reste réservé au technique** : contexte `WEBVIEW_*` introuvable (`platform().inWebContext()`), variable d'environnement manquante (`requireEnv`) — un humain doit corriger la configuration ou l'environnement, pas relire le comportement de l'app.

```typescript
import {AssertionError} from 'node:assert'

// ✅ Erreur de test — l'API partenaire a répondu, mais avec un statut d'échec après épuisement des
// retries applicatifs (cf. §7) : ça révèle un vrai problème d'application/API, pas un test cassé.
lastError = new AssertionError({message: `PUT /api/v2/event → HTTP ${response.status}: ${text}`})

// ✅ Erreur technique — rien à voir avec l'application : la WebView n'existe pas, il faut corriger
// les capabilities Appium ou l'environnement, pas enquêter sur un comportement métier.
throw new Error(
    `Aucun contexte WEBVIEW_* trouvé après ${WEBVIEW_WAIT_MS}ms. Contextes disponibles : [${contexts.join(', ')}]. ` +
    'Vérifier appium:chromedriverAutodownload (Android) ou appium:webkitResponseTimeout / isInspectable=true (iOS).'
)
```

---

## 9. Rapports Allure

- **`addFeature` et `addSeverity` sont obligatoires** dans chaque `describe` ou `it` — ils permettent le filtrage par feature/sévérité en CI. `addStory` et `addTag` sont optionnels.
- **`addStep`** pour découper un scénario long en étapes métier — chaque étape regroupe dans Allure les commandes qui lui appartiennent, avec un indicateur pass/fail par étape.
- **`addAttachment`** pour joindre une donnée de debug utile en cas d'échec (réponse API, URL courante, screenshot ponctuel avant un clic fragile) — au-delà du screenshot automatique déjà pris par le hook `afterTest`.

```typescript
import AllureReporter from '@wdio/allure-reporter'

AllureReporter.addFeature('Notifications')
AllureReporter.addSeverity('critical') // blocker | critical | normal | minor | trivial

AllureReporter.addStep('1. Login FranceConnect')
// ...

try {
    await publishNotification({title, body})
} catch (err) {
    // addAttachment puis re-throw tel quel — ne jamais changer le type de l'exception ici : publishNotification()
    // lève déjà AssertionError (échec API, §8) ou Error (config manquante, §8) selon la nature réelle de l'échec.
    AllureReporter.addAttachment('Erreur API', String(err), 'text/plain')
    throw err
}
```

La configuration du reporter (`outputDir`, `disableWebdriverStepsReporting`, `addConsoleLogs`) est commentée directement dans `wdio.base.conf.ts`. La commande pour générer et ouvrir le rapport est documentée dans le [README](README.md).

---

## 10. Règles de débogage

- **Observer avant d'écrire un sélecteur** — inspecter l'écran réel (`just explore <cible>` puis `just s <cible> snapshot -i`) plutôt que deviner un sélecteur « qui devrait marcher ».
- **Ne jamais commiter un locator ou un workaround qui n'a pas été validé** en exécution réelle. Un commit de workaround hypothétique casse silencieusement un autre cas. Tester d'abord, puis commiter avec un message qui décrit le **pourquoi** (bug WKRDP, AX tree périmé, etc.), pas seulement le *quoi*.
- **Toggles de debug** (`logLevel: 'info'`, `specFileRetries: 0`) : tolérés commités tant que la suite est en développement actif, pour faciliter le diagnostic quotidien. `wdio.base.conf.ts` est aujourd'hui à
  `logLevel: 'warn'` / `specFileRetries: 0`.
- Avant toute session de débogage approfondie, regarder le dernier rapport Allure et les logs Appium (`.wdio-logs/`) — souvent suffisant pour identifier la commande qui a échoué sans avoir à relancer en `logLevel: 'debug'`.

La boucle d'exploration (`wdio session` : `just explore`, `just s`, `just webview`, `just explore-export`, `just debug`) et le détail des commandes `just` sont documentés dans le [README](README.md#explorer-et-déboguer-avec-wdio-session-webdriverio-10).
