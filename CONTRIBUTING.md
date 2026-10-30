# Contribuer aux tests E2E AMI

Les règles à suivre pour écrire ou modifier un test. Pour installer ou lancer les tests : [README](README.md). Un cas qui ne concerne qu'un écran ou une méthode se documente en commentaire dans le fichier de code concerné.

Le code doit aussi être conforme aux bonnes pratiques et aux guides de la documentation officielle de WebdriverIO, d'Appium et de Mocha.

## Principes

Ce code doit pouvoir être compris et maintenu par un humain, sans IA, sans avoir à lire ni écrire beaucoup de code. On fait du simple design, avec ces quatre règles dans cet ordre :

1. **Il révèle l'intention métier.** Les noms disent ce que fait le scénario ; un commentaire ne sert qu'à dire un « pourquoi » que le code ne peut pas dire.
2. **Il passe tous les tests.** Pour du code de test : lint, compilation (`just check-code`) et tests passants.
3. **Il n'a pas de duplication.**
4. **Il a un minimum d'éléments** : pas d'export, de paramètre, de méthode ni de couche sans appelant.

Et KISS, sans décoration :

- Les erreurs sont brutes : l'erreur d'origine remonte, sans message retravaillé, sans conseil, sans enveloppe. Seul le masquage de sécurité reste (`maskSensitiveUrl`, `trace-redact`) : aucun jeton ni secret dans un message ou un log.
- Pas de `log.info` informatif ni de commentaire d'historique (date, mesure, campagne) : l'historique est dans git. Un piège à connaître va dans [Pièges](#12-pièges), pas dans le code.
- Un `catch` ne sert qu'à une décision de test (par exemple « absent : on saute l'étape »). Un `catch` qui journalise puis continue n'a pas sa place.

## Sommaire

1. [Page Objects — architecture 3 niveaux](#1-page-objects--architecture-3-niveaux)
2. [Sélection des éléments](#2-sélection-des-éléments)
3. [Attendre sa page, puis agir](#3-attendre-sa-page-puis-agir)
4. [WebView et contextes](#4-webview-et-contextes)
5. [Qualité des assertions](#5-qualité-des-assertions)
6. [Isolation des tests](#6-isolation-des-tests)
7. [Retry](#7-retry)
8. [Erreurs de test et erreurs techniques](#8-erreurs-de-test-et-erreurs-techniques)
9. [Rapports et dumps d'échec](#9-rapports-et-dumps-déchec)
10. [Mettre au point un scénario](#10-mettre-au-point-un-scénario)
11. [Logging](#11-logging)
12. [Pièges](#12-pièges)

---

## 1. Page Objects — architecture 3 niveaux

```
src/tests/mobile/    scénarios Mocha Android + iOS — zéro sélecteur, zéro if(driver.isIOS)
src/tests/webapp/    scénarios Mocha webapp — même contrainte
src/pages/           Page Objects — logique métier, sans sélecteur
src/pages/locators/  sélecteurs : variantes web / android / ios selon la page
```

### Niveau 1 — `locators/*.locators.ts`

Un fichier par page. Les locators d'une page existent en trois variantes, **toutes facultatives** : `web` (la webapp et la WebView des apps mobiles), `android` et `ios` (la page est native sur cette plateforme). Une page en cours de promotion vers le natif peut en avoir trois (par exemple `web` + `android`) pour rester testable dans la webapp. Une page peut cesser d'exister en webapp (réglages du mobile) : elle n'a alors pas de `web`.

**Page WebView seule** (la grande majorité) : un simple objet de constantes, identique sur les trois plateformes, sans fonction. Les sélecteurs restent dans ce fichier, jamais dans le Page Object : un seul endroit à changer (par exemple le jour où l'i18n arrive).

```typescript
export const homeContentLocators = {
    greeting: 'h1*=Bonjour',
    agendaHeading: roleSelector('heading', 'Mon agenda'),
}
```

**Page avec une version native** : un objet par variante, une même interface, et `pickLocators` (`src/helpers/common/pick-locators.ts`).

```typescript
export const loginVariants: LocatorVariants<LoginLocators> = {
    web: {button: 'button*=identifier avec FranceConnect'},
    android: {button: '~franceConnect button'},   // pas de variante ios : la page est encore en WebView sur iOS
}
export const getLoginLocators = (): LoginLocators => pickLocators('LoginPage', loginVariants)
```

`getLoginLocators()` renvoie la variante adaptée au **contexte courant** de l'appelant (`platform().context()`) :

| Contexte courant | Variante |
|---|---|
| webapp | `web` |
| mobile, dans un `inWebContext` | `web` |
| mobile, hors `inWebContext` (natif) | `android` ou `ios` |

Si la variante n'existe pas, `pickLocators` lève une erreur technique (« LoginPage n'a pas de locators ios : l'appeler dans un inWebContext », ou « …pas de locators web »).

**Page mixte** (le Page Object gère lui-même le passage du natif à la WebView : FranceConnect, onboarding des notifications, flows OIDC) : le choix par contexte donnerait la mauvaise variante, car un sélecteur est évalué avant l'entrée dans la WebView. Le Page Object accède explicitement à la variante voulue (`loginVariants.web.button`, `loginVariants.android.button`) et `hasNativeLocators(loginVariants)` dit si la page est native sur la plateforme courante.

**Qui change de contexte** : `inWebContext` est l'affaire de la couche scénario (un par test, hook ou flow : moins on bascule, plus on va vite) et des flows mixtes. Les Page Objects et les aides ne s'enveloppent pas.

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur ni nom accessible en littéral** : tout vient du fichier de locators de la page. Les éléments de la SPA s'atteignent par les sélecteurs natifs de WDIO 10 définis dans le fichier `locators/` de la page (cf. §2) et par les aides de `src/helpers/spa/spa.ts`.
- Exporté comme singleton tracé : `export default traced(new XxxPage(), 'XxxPage')`.
- `if (driver.isIOS)` seulement quand le **comportement d'interaction** diffère vraiment, pas juste le sélecteur. Avant un branchement plateforme, chercher un signal DOM commun aux deux (la disparition d'une modale est observable partout).
- **Exception : `SystemNotificationsPage`** (permission, notifications poussées, réglages système de l'app). Elle pilote les réglages des OS, qui ne sont pas identiques comme peuvent l'être des apps natives : elle a le droit de brancher sur `driver.isIOS` / `driver.isAndroid` pour appeler l'utilitaire du bon OS (`android-notifications.ts`, `ios-notifications.ts`).
- Le dispatch de comportement passe par `platform()` (cf. §4).

### Niveau 3 — `tests/*.test.ts`

N'appelle que des méthodes de Page Object. Le test se lit comme un scénario métier, sans sélecteur.

#### Nom des specs : `<périmètre>.<catégorie>.test.ts`

Le périmètre est en kebab-case français (`profil-et-suppression-a-la-deconnexion.usage.test.ts`). Trois catégories :

| Catégorie | Ce que fait la spec | Exemples |
|-----------|---------------------|----------|
| `smoke` | prouve que l'essentiel fonctionne : authentification, accueil | `authentification.smoke.test.ts` |
| `parcours` | parcourt des pages en lecture seule (liens sans 404, pages d'erreur), sans modifier le compte | `catalogue.parcours.test.ts` |
| `usage` | un cas d'usage de bout en bout, qui agit (démarche publiée, profil modifié, consentement, déconnexion) | `demarches-cycle-de-vie.usage.test.ts` |

`src/tests/webapp/parcours/` regroupe les specs qui parcourent des zones configurées par l'administrateur (catalogue, services, détail d'une démarche, listes d'étapes). Leur contenu varie selon l'environnement et elles suivent des liens externes dont une partie n'est joignable que depuis un réseau privé : les cibles injoignables les rendent lentes (plusieurs minutes). Elles sont hors `webapp_usage`.

La catégorie du nom de fichier fait entrer une spec dans une suite. `wdio.webapp.conf.ts` repère par le nom de fichier (`authentification.smoke.test.ts`, `otv-connexion-silencieuse.usage.test.ts`, `zones-onboarding.usage.test.ts`) les specs qui exigent un profil Chrome vierge : à garder en phase en cas de renommage.

#### Suites nommées

Source de vérité : l'objet `suites` de `wdio.base.conf.ts` (option native `--suite <nom>`). Listes plates de specs, un worker par spec. Préfixe `mobile_` (Android + iOS) ou `webapp_` (Chrome), jamais mélangés. L'authentification est le premier spec à tourner (elle valide l'authentification complète : smoke d'abord dans les suites) ; chaque autre spec s'authentifie seule (`getAppToStartingState`), donc aucun autre ordre n'est requis.

| Suite | Usage | Contenu |
|---|---|---|
| `mobile_short` | CI en mise au point, lancements manuels par défaut | `authentification.smoke` seule |
| `webapp_short` | idem | `authentification.smoke` seule |
| `mobile_all` | PR, merge, tag ; hors CI : tester un déploiement | tous les tests mobiles, smoke d'abord |
| `webapp_usage` | PR, merge, tag (API) | tous les `*.smoke` + tous les `*.usage` |
| `mobile_smoke` | hors CI : valider un déploiement | motif `*.smoke.test.ts` mobile |
| `webapp_smoke` | hors CI : valider un déploiement | motif `*.smoke.test.ts` webapp |
| `webapp_all` | hors CI : tester un déploiement | tous les tests webapp, parcours compris (long) |

```bash
AMI_ENV=staging just test-webci --suite webapp_smoke    # valider un déploiement (webapp)
just test-android --suite mobile_smoke                  # idem mobile (test-ios aussi)
npx wdio run wdio.webapp.conf.ts --suite webapp_smoke   # sans just
```

---

## 2. Sélection des éléments

**Sélectionner par le sens perçu par l'utilisateur**, pas par la structure DOM.

- **WebView / webapp** : sélecteurs natifs de WDIO 10, définis dans les fichiers `locators/` (jamais dans le Page Object), utilisés avec `$()`, `$$()`, le chaînage et `expect(…)` :

  | Besoin | Sélecteur |
  |---|---|
  | rôle et nom accessible **exact** | `role/button[name="Suivi"]`, construit par `roleSelector()` (`src/helpers/spa/selectors.ts`) |
  | texte visible qui **contient** (fragment sans apostrophe) | `button*=Voir les notifications` ; insensible à la casse : `button.*=valider` |
  | champ de formulaire | attribut stable (`input[name="login"]`) |
  | élément sans nom accessible stable | `[data-testid="x"]` (dernier recours) |
  | dans un conteneur | `$(conteneur).$(élément)` ou l'option `within` des aides |

  Les aides de `src/helpers/spa/spa.ts` s'appellent dans le `inWebContext` de l'appelant mobile : `waitForHeading`, `waitForRole`, `clickRole`, `clickButton`, `waitForButtons`, `waitForPageText` (attendent) ; `isShown`, `hasPageText` (sondes) ; `firstDisplayed`, `allDisplayed` (retournent un élément, à utiliser dans un `inWebContext` ouvert) ; `clickDisplayed`, `visibleButtonTexts`, `checkboxStates`.
- **Natif** (hors WebView) : `accessibility id` (`~xxx`) de préférence à un XPath par texte ou un resource-id brut. Les sélecteurs `role/…` et `driver.execute()` n'ont pas de prise sur le natif : `$()` avec des sélecteurs natifs y est obligatoire. Ne pas `await` le `$()` lui-même : il se re-résout à chaque commande.
- Pour atteindre un élément hors écran d'une liste native : `element.scrollIntoView({direction: 'up', maxScrolls})`, pas de boucle de swipe écrite à la main (exemple : `EnvironmentPickerPage.reviewEnvironmentPicker`).

### Ordre de préférence

1. **Les aides `spa.ts` et les attentes de WDIO** (`waitForDisplayed`, `expect(…).toBeDisplayed()`, `waitForExist`) : elles réessaient jusqu'à trouver, il n'y a rien à enrouler dans une boucle (cf. §7). WDIO 10 n'attend pas l'existence d'un élément avant `click()` : attendre explicitement (`waitForClickable`, ou `waitForExist` pour un élément transparent).
2. **Les API WDIO indépendantes de la plateforme** sur un élément obtenu (`.click()`, `.getText()`, `.isSelected()`) : elles survivront à la promotion d'une page en écran natif.
3. **`driver.execute()`** en dernier recours : du JavaScript, donc valable seulement en WebView / webapp. Il porte un commentaire qui dit pourquoi les sélecteurs natifs et les API WDIO ne suffisent pas.

Testing Library (`tl()`) est retiré : ne plus importer `setupBrowser`, ni écrire `tl()`, `findBy*`, `getBy*`, `queryBy*`, `within()`.

- **Sondes** (sur quel écran est-on ?) : `isShown(sélecteur, timeout)` ou `hasPageText`. Un `.catch(() => false)` sur un `$()` avalerait une violation du mode strict.
- **Agrégats** (liste de textes, états de cases) : `visibleButtonTexts`, `checkboxStates`.
- Besoin non couvert : ajouter une aide dans `spa.ts` et le sélecteur dans le fichier `locators/` de la page.

### `data-testid` : dernier recours

Essayer d'abord `clickRole`, `waitForRole`, `waitForPageText` (rôle, nom, texte) et ne basculer que si cette requête échoue réellement. Cas justifiés : rôle et nom dupliqués sur la page, ou texte imprévisible. Documenter l'échec observé à côté du champ.

### Classes CSS

Les classes du design système État (`fr-tile__content`, `fr-badge`) sont un contrat stable, utilisables après `data-testid`. Les classes générées par Svelte (`svelte-19k7n5y`) changent à chaque build : jamais.

### Apostrophes

Le contenu FR utilise l'apostrophe typographique `’` (U+2019) ; taper `'` casse le test. Pour un texte « contient », choisir un fragment sans apostrophe (`button*=Votre démarche n`). Pour un nom exact, copier l'apostrophe du DOM (DevTools, `just s <cible> find`), jamais la retaper, et le dire en commentaire du locator.

Le raisonnement détaillé de ces choix est dans l'ADR `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`.

---

## 3. Attendre sa page, puis agir

**Un écran se vérifie lui-même ; une action source ne vérifie jamais sa destination.**

1. Chaque Page Object d'une page de la SPA a une méthode `assertDisplayed()` (avec le titre en argument quand il est dynamique ou que la page a plusieurs vues). N'en ont pas : `NavigationPage` (barre de navigation), les pages d'onboarding (conditionnelles, elles ont une sonde `isVisible`), les pages FranceConnect et `ServicePublicPage` (pages externes), `SystemNotificationsPage` et `EnvironmentPickerPage` (natives). Elle attend le titre (`heading`) ou le rôle qui identifie la page, avec un `timeout`, jamais via `window.location.hash` (il peut changer avant que le contenu soit rendu). Le scénario l'appelle après une navigation, et les méthodes publiques du Page Object s'en servent en interne pour vérifier qu'elles sont sur la page attendue avant d'agir.
2. Une méthode qui navigue ne connaît pas la page suivante : elle clique et rend la main. Les Page Objects ne s'importent pas entre eux (hors `NavigationPage` et les helpers). L'arrivée est vérifiée par la page cible, via `assertDisplayed()` (avec le titre en argument s'il est dynamique : `DemarcheDetailPage.assertDisplayed(title)`). Le scénario enchaîne les deux :

   ```typescript
   await HomePage.openAllEvents()
   await AgendaPage.assertDisplayed()
   ```

3. Par défaut, on ne vérifie pas qu'une action est terminée : le clic est supposé pris en compte. Exception, avec preuve : un clic dont la perte est établie. La postcondition porte sur la page d'origine (`clickButtonUntilGone` : le bouton disparaît), jamais sur la suivante.
4. Page au contenu imprévisible (services du catalogue) : vérifier seulement que ce n'est pas une page d'erreur.
5. Donnée asynchrone : une page abonnée au temps réel (accueil, inbox via WebSocket) se met à jour en place, attendre avec une primitive `spa.ts`. Une page sans abonnement (Suivi) ne se met à jour qu'au chargement : recharger la page à chaque essai, à intervalle fixe de 2 s (`SuiviDemarchesPage.waitForDemarche`).
6. Ne pas vérifier la disparition d'un composant après une action : les pages se recyclent, et résoudre un élément disparu attend la durée du timeout.

### Cas nominal et écarts

L'app est testée sur des contextes modernes et anciens (appareil, OS, surcouche constructeur). Le comportement attendu est le même partout ; sinon c'est une anomalie, pas une variante normale.

- Le Page Object suit le parcours nominal : la cible (un seul tap sur « S'identifier avec FranceConnect »).
- Un écart est écrit dans le Page Object par une branche explicite et facultative : attente courte, absence sans effet (un appareil conforme ne doit jamais échouer à cause d'elle).
- Ne pas cacher un écart dans un fichier de locators ou de configuration : il deviendrait une variante normale que plus personne ne remet en cause.
- Une branche d'écart est temporaire : quand l'app est corrigée, on la supprime.

---

## 4. WebView et contextes

Ce qui diffère entre Android, iOS et webapp est isolé derrière `PlatformAdapter` (`src/platform/types.ts`) : `appiumAdapter` (mobile) et `browserAdapter` (webapp). `platform()` retourne le bon.

```typescript
interface PlatformAdapter {
    readonly kind: 'android' | 'ios' | 'webapp'
    context(): 'web' | 'native'          // lu en mémoire ; syncContext() relit le contexte réel
    inWebContext<T>(callback: () => Promise<T>): Promise<T>
    isWebContextAvailable(): Promise<boolean>
    refreshAxTree(): Promise<void>       // iOS seulement
    pullToRefresh(): Promise<void>
}
```

- **`platform().inWebContext()` est la seule façon d'atteindre le DOM de la SPA**, jamais `driver.switchContext()`. Sur mobile, il bascule `NATIVE_APP` → `WEBVIEW_*` et remet le contexte d'origine dans un `finally`. Sur webapp, il est quasi-identité. Il est réentrant, d'après l'état réel du driver : dans une WebView déjà active qui convient, le callback s'exécute sans y toucher.
- **L'enveloppe est posée par l'appelant mobile** (un `inWebContext` englobant par test, hook ou flow), jamais dans un spec webapp, ni dans les Page Objects ni les aides. Exceptions voulues : les flows mixtes natif / WebView d'authentification (`authenticate.process.ts`, pages d'onboarding et FranceConnect, `session.ts`) et `SystemNotificationsPage` (elle revient à l'accueil dans la WebView après une notification) s'enveloppent eux-mêmes, car l'enveloppe du test ne peut pas couvrir leurs étapes natives. Pour eux, `isShown` et `clickDisplayed` ouvrent aussi le contexte (réentrant : sans effet dans une WebView déjà active, donc sans conséquence pour les autres Page Objects qui les appellent depuis un `inWebContext`). Une aide qui retourne un élément se lit dans un `inWebContext` ouvert : l'élément ne survit pas à la sortie.
- **Plusieurs WebViews** : `platform().inWebContext({title: 'Titre'}, callback)` vise une WebView par son titre (chaîne « contient » ou RegExp). Sans correspondance, ou sans cible, c'est la dernière WebView hors workers.
- Les sélecteurs CSS/XPath ne fonctionnent qu'en `WEBVIEW_*` ; les gestes et sélecteurs natifs qu'en `NATIVE_APP`. Un geste natif ne s'appelle jamais depuis un `inWebContext()`.
- **Flow OIDC FranceConnect : un seul `platform().inWebContext()`** pour tout le flow (eIDAS, identifiants, callback). Sortir du contexte au milieu bloque ~25 s sur iOS.
- Naviguer par un vrai clic utilisateur (`clickRole(…)`) plutôt que par `driver.execute(() => el.click())` : le clic JS est silencieux sur iOS en cas d'échec.
- Les éléments ne survivent pas à un changement de contexte.

---

## 5. Qualité des assertions

La qualité d'une assertion se mesure au message produit en cas d'échec.

```typescript
// La valeur réelle apparaît dans le message d'échec
expect(title).not.toBe('')
expect(version).toMatch(/\d+\.\d+/)

// Seul le fait d'être non vide ou typé est vérifié : valeur cachée
expect(title.length).toBeGreaterThan(0)
expect(typeof enabled).toBe('boolean')
```

- `await` devant `expect` uniquement quand il reçoit un élément WDIO : `await expect($(loc)).toBeDisplayed()`. Jamais devant une valeur déjà résolue (`string`, `boolean`, `number`).
- `waitUntil` : toujours un `timeoutMsg`, sinon le rapport ne montre qu'un « Timeout exceeded ».
- Asserter une absence par `waitUntil`, jamais par un contrôle immédiat : après une action, la SPA a besoin d'un cycle de rendu.
- Fusionner les vérifications sur un même item en une méthode de Page Object, dans un seul `waitUntil` avec une variable d'état (`failReason`) qui dit jusqu'où l'attente est allée.
- Ne pas doubler `waitForDisplayed` et `isDisplayed`.

---

## 6. Isolation des tests

Ce projet ne fait que des **tests système E2E de parcours utilisateur** (user journeys). Ce ne sont ni des tests unitaires ni des tests d'intégration isolables. Une spec raconte un scénario : **chaque `it()` en est une étape**, qui déroule une série d'actions. Les `it()` se déroulent **dans l'ordre du fichier** et **conservent l'état et la session** d'une étape à l'autre. C'est ce qui rend lisible l'étape du scénario en échec : avec un seul `it()` par spec, on verrait beaucoup moins bien où le parcours a cassé.

- **Cas courant : le scénario.** Les `it()` d'une spec dépendent les uns des autres, en commençant par un `before` qui amène l'app dans l'état de départ (`getAppToStartingState`). Le cycle de vie d'une démarche (publiée, en cours, terminée) en est l'exemple : une étape par statut. Documenter la dépendance en commentaire du `describe`, utiliser un identifiant unique horodaté, et ne pas supposer l'état de l'app laissé par l'étape précédente quand l'API suffit à l'établir.
- **Exception : l'`it()` indépendant**, qui s'exécute seul et dans n'importe quel ordre. Il remet l'état qu'il modifie dans l'état initial (dans le test ou dans `afterEach`).
- Mobile : `mochaOpts.bail` — au premier `it` en échec, les suivants ne sont pas lancés (ils dépendent du précédent) ; les hooks `after` s'exécutent.
- `specFileRetries` rejoue le **fichier entier** dans une nouvelle session, jamais un `it()` isolé (cf. §7).

**Entre fichiers de spec.** Avec `--spec` ou hors suite nommée, chaque fichier obtient une session fraîche. Une suite nommée est une liste plate équivalente à `--spec a --spec b` : un worker par fichier. L'état est cependant conservé d'un fichier à l'autre : profil Chrome du run en webapp, données et session de l'app sur mobile (l'app est arrêtée après chaque spec et relancée par la suivante). En webapp, seules les specs repérées par `wdio.webapp.conf.ts` (authentification, otv-connexion-silencieuse, zones-onboarding) repartent d'un profil Chrome vierge. Ne pas supposer une session fraîche du seul fait d'être dans un nouveau fichier.

- `before` : la navigation coûteuse faite une fois (onboarding, login OIDC ~30 s). `beforeEach` : un reset avant chaque `it()`, pour les specs faites d'`it()` indépendants. `driver.reset()` est déprécié dans Appium 3 : `terminateApp` + `activateApp`, ou `fullReset: true`.
- **Un test ne fait pas `xcrun simctl` ni `adb` directement.** Il s'appuie sur l'environnement préparé avant le run (appareil démarré, app installée par Appium depuis `ANDROID_APP_PATH` / `IOS_APP_PATH`). Exception : un test qui vérifie l'effet sur l'appareil ou l'OS (notifications système, un jour le local storage) passe par un helper de `src/helpers/mobile/`.
- **Idempotence backend** : un test qui publie des données utilise un identifiant ou titre unique horodaté (`` `AMI-vanilla-${Date.now()}` ``), sinon un backend en `get_or_create` renvoie le record d'un run précédent.

---

## 7. Retry

| Niveau | Mécanisme | Session Appium | Quand |
|---|---|---|---|
| **Spec** | `specFileRetries` | fraîche (nouveau processus) | instabilité d'environnement (simulateur, réseau) |
| **Applicatif** | retry dans le code | conservée | cold-start d'une API (5xx transitoires) |
| **Page Object** | `try/catch` | conservée | élément instable après une redirection |

- **Éviter `mochaOpts.retries`** : il relance le `it()` dans la même session, dont l'état peut être corrompu, et un vrai bug qui passe au 2e essai devient invisible.
- Retry applicatif : sur 5xx seulement, jamais sur 4xx.
- Retry court en Page Object : le `catch` porte une décision (réessayer, ou « absent ») et une ligne dit laquelle. Un `catch {}` vide masque un vrai bug.
- Ne pas retrier les aides `spa.ts` : elles attendent déjà (`timeout`). Augmenter ce timeout.
- Ne pas corriger chaque échec temporaire : un échec isolé dû à l'infrastructure ne justifie pas un correctif. Corriger sur une récurrence mesurée, avec une cause établie.
- `specFileRetries` (`wdio.base.conf.ts`) : 0 par défaut et pour toute mesure, 1 en CI (`CI=true`). `WDIO_SPEC_FILE_RETRIES=N` ou `--specFileRetries=N` pour forcer. Un échec rejoué à l'identique en CI est un bug reproductible ou un test instable : il s'investigue. Un échec qui passe au 2e essai est un test instable : il se note pour mesurer sa récurrence.

---

## 8. Erreurs de test et erreurs techniques

Deux catégories d'échec, à ne pas mélanger dans le type d'exception :

| Catégorie | Signification | Type levé |
|---|---|---|
| **Erreur de test** | l'application n'a pas fait ce qu'on attendait | `expect(...).toXxx()` ou, hors `expect-webdriverio` (boucle de polling, réponse HTTP), `AssertionError` (`node:assert`) |
| **Erreur technique** | le test n'a pas pu s'exécuter (infra, environnement, configuration) | `Error` |

Le type dit s'il faut suivre un bug applicatif ou réparer le test ou l'environnement. `expect(...)` reste le premier choix ; `AssertionError` est réservé aux échecs métier hors `expect()` (sortie d'une boucle d'attente, réponse HTTP inattendue de l'API partenaire). `Error` est réservé au technique (aucune WebView, variable d'environnement manquante).

Le message reste court et brut : ce qui a été attendu et ce qui a été observé. L'erreur d'origine n'est pas enveloppée.

```typescript
// Erreur de test : l'API a répondu, avec un statut d'échec
throw new AssertionError({message: `PUT /api/v2/event → HTTP ${response.status}: ${text}`})

// Erreur technique : rien à voir avec l'application
throw new Error(`Aucune WebView trouvée après ${WEBVIEW_WAIT_MS}ms`)
```

---

## 9. Rapports et dumps d'échec

- **`step('…')`** (`src/helpers/reporting/report.ts`) découpe un scénario long en étapes métier : mémorisée, puis écrite dans le dump d'un test en échec (où le scénario s'est arrêté).
- **Résumé** : reporter JUnit, un seul rapport par run, `test-results/junit/results-<horodatage>_<plateforme>_<suite ou spec>.xml`, un `<testsuite>` par fichier de spec, un `<testcase>` par `it()`. `onComplete` fusionne les fichiers des workers (`junit-clean.ts`) et ajoute à chaque `<testcase>` des `<property>` (`junit-join.ts`) : `platform`, `ami_env`, `outcome` (`passed`, `failed`, `skipped`, `flaky` = réussi à la relance après un échec), `attempt`/`attempts`, et pour un échec `dump_path`, `context_kind` (`web` ou `native`) et `sentry_url` (contexte web seulement). Tests : `npm run test:unit`, `npm run test:unit:ci`.
- **Contexte d'un test en échec** (`failure-dump.ts`, hook `afterTest`) : `test-results/traces/<run>/failures/<test>__<horodatage>/context.json` : test, étapes, erreur, plateforme, appareil, backend, URL aux jetons masqués, identifiants Sentry. Lister les échecs : `just failures-text`.
- **Trace d'un test en échec** (service DevTools, cf. `traceServices` dans `wdio.base.conf.ts`) : `test-results/traces/<run>/test-results/<spec>_test-<test>-…/trace/` : `transcript.md` à lire en premier, captures, arbre de l'écran, réseau aux cookies et jetons masqués par `trace-redact.ts`. L'ouvrir : `just failures-ui`.
- **Ne jamais écrire de secret ni de jeton** dans un dump ou un log : les URL passent par `maskSensitiveUrl` (`src/helpers/common/session.ts`).

### CI

Un check « e2e (ami-system-tests) » et un commentaire de PR (test | résultat | durée | lien Sentry, échecs en premier) sont produits par `.github/scripts/e2e-comment.mjs`. Les jobs restent verts même si des tests échouent : le résultat se lit dans le check. iOS n'est pas développé en CI. Détail : `docs/adr/2026-08-04-Integration-continue-Github-Actions.md`.

| Déclencheur | Webapp | Android | Appareil |
|---|---|---|---|
| PR ou tag (API, app Android) | `webapp_usage` (API) | `mobile_all` | ancien `pixel_2_api30` |
| merge (API, app Android) | `webapp_usage` (API) | `mobile_all` | récent `pixel_8_api36` |
| manuel (`workflow_dispatch`) | `webapp_short` | `mobile_short` | au choix |

Secrets et variables à créer dans le dépôt appelant (jamais de valeur dans le code) : `NOTIF_PARTNER_ID` et `NOTIF_PARTNER_SECRET`, `NOTIF_PARTNER_DINUM_DN_ID` et `NOTIF_PARTNER_DINUM_DN_SECRET` (partenaire à consentement activé, sinon les scénarios concernés sont sautés), `WEB_APP_ACCESS_KEYS`, et pour l'APK du dernier tag la variable `AMI_REVIEWAPPS_APP_ID` et le secret `AMI_REVIEWAPPS_PRIVATE_KEY` (GitHub App `ami-reviewapps`, limitée à `actions: read` sur `ami-app-android`).

---

## 10. Mettre au point un scénario

On met un scénario au point en l'exécutant pas à pas, dans une vraie session, avant de l'écrire. Le tutoriel `src/tests/tutorial/automatiser-un-scenario-a-la-main.md` (avec `tutorial.test.ts`) déroule un exemple complet, de la spécification au test rangé dans les 3 niveaux ; la boucle ci-dessous s'applique avec ou sans lui.

Une session `wdio session` survit à la commande qui l'a ouverte (arrêt après 30 min d'inactivité) : on enchaîne de petites commandes, sans relancer l'app.

| Je veux… | Commande |
|---|---|
| Ouvrir une session | `just explore-webapp "/#/agenda"` · `just explore-android` · `just explore-ios` (l'appareil doit déjà tourner) |
| Lire la page : éléments interactifs, avec refs | `just s <cible> snapshot -i` · `just s <cible> find "texte"` |
| Agir sur une ref | `just s <cible> click e3` · `just s <cible> fill e4 "valeur"` |
| Inspecter le DOM d'une WebView mobile | les DevTools : `chrome://inspect` (Android), Safari > Développement (iOS) |
| Voir les contextes, basculer | `just s <cible> contexts` · `just s <cible> contexts switch WEBVIEW_…` |
| Erreurs console, appels réseau (web) | `just s <cible> logs --errors` · `just s <cible> requests` |
| Transformer les étapes en test | `just explore-export <nom> <cible>` → `exports/<nom>.e2e.ts`, à ranger dans un Page Object |
| Figer un test à son premier échec | `just debug-webapp <spec>` (mobile : `npx wdio run wdio.android.conf.ts --spec <spec> --debug=agent`) puis `just s debug-0-0 snapshot -i`, `screenshot`, `resume` |
| Voir les échecs du dernier run | `just failures-text` · `just failures-ui` · logs Appium dans `.wdio-logs/` |
| Diagnostiquer la machine | `just doctor` |
| Fermer | `just explore-close <cible>` |

**Une IA peut dérouler un parcours décrit en langage naturel de cette façon** (skill `wdio-session`, cf. [CLAUDE.md](CLAUDE.md)) et proposer un premier scénario de test. Lui demander ensuite de relire son code avec les règles de ce document avant de l'accepter.

Règles :

- **Observer avant d'écrire un sélecteur** : inspecter l'écran réel plutôt que deviner un sélecteur « qui devrait marcher ». Après `just explore-android` ou `explore-ios`, l'app est sur le sélecteur d'environnement (natif, sans WebView) : choisir une tuile pour charger la SPA, `contexts` échoue tant qu'il n'y a aucune WebView.
- **Ne jamais commiter un locator ou un contournement qui n'a pas été validé** en exécution réelle. Le message de commit dit le pourquoi, pas seulement le quoi.
- Webapp : ne pas ouvrir les DevTools ni poser de breakpoint sur l'onglet testé (cf. [Pièges](#12-pièges)). Pour un diagnostic sans interaction, `console.log` avec `just test-webci`.
- `logLevel: 'debug'` dans `wdio.base.conf.ts` affiche chaque commande Appium : à ne pas commiter.
- `just debug-webapp` se met en pause au premier échec d'un test ; un échec de hook (`before all`) ne déclenche pas la pause.

---

## 11. Logging

Pas de `console.*` dans le code qui tourne dans une session WDIO (pages, tests, helpers, hooks de config) : `@wdio/logger`, importé seulement dans les fichiers qui l'utilisent (`no-unused-vars` est une erreur de lint).

```typescript
import logger from '@wdio/logger'
const log = logger('<namespace>')
```

On ne journalise que ce qui aide à lire un résultat : le motif visible d'un `this.skip()`, une anomalie tolérée. Pas de `log.info` de suivi.

| Couche | Namespace |
|---|---|
| `pages/*.page.ts` (via `traced()`) | `page-object` |
| hooks globaux `wdio.base.conf.ts` | `scenario` |
| `tests/*.test.ts` | `test` |
| `helpers/partner-api/*.ts` | `api` |
| `wdio.*.conf.ts` (`onPrepare`, etc.) | `config` |
| autres `helpers/**/*.ts` appelés en session | `helper` |

Les scripts CLI hors session (`src/scripts/*.ts`) restent en `console.*` : leur sortie est leur produit.

---

## 12. Pièges

Ce que le code ne peut pas dire de lui-même. Chaque piège est une cause établie, pas une hypothèse.

### Sélecteurs et WebView

- `role/…[name=…]` compare le nom **exactement**, tel que le moteur le calcule : sans le texte des icônes `aria-hidden`, et Chrome garde une espace finale pour un bouton icône + texte (`<button role="link">` eIDAS) : utiliser `button*=texte`. Un `&nbsp;` dans un titre est normalisé différemment selon le moteur : `h1*=Où habitez-vous`. Refusé en contexte natif.
- Plusieurs éléments peuvent avoir le même nom (boutons icône « Ouvrir la modale… », cartes d'un carrousel Splide, dupliquées en `splide__slide--clone`). `$(sélecteur)` attend un seul résultat et lève sinon une « strict mode violation » ; `$$(sélecteur)` renvoie la liste. Pour agir sur le premier élément affiché : `firstDisplayed(sélecteur)`. Pour le carrousel : un parent unique, `li.splide__slide.is-visible:not(.splide__slide--clone)`.
- Une chaîne `$(parent).$(enfant)` gardée dans une variable garde son parent résolu : la reconstruire à chaque appel (`const carte = () => $(parent).$(enfant)`).
- Après une déconnexion, la page est remplacée et un élément déjà trouvé n'est plus valide (« belongs to different document »). Pour attendre sa disparition, le chercher à nouveau par son sélecteur : `$(sélecteur).waitForDisplayed({reverse: true})`, pas `élément.waitForDisplayed(…)`.
- Un élément transparent (`opacity: 0`, flèches Splide hors survol) n'est pas « affiché » mais reste cliquable : `waitForExist` puis `click()`.
- `aria/<libellé>` renvoie parfois un élément non éditable pour un champ (« invalid element state » au `clearValue()`) : cibler le champ par un attribut (`input[name=…]`).
- iOS : `getComputedLabel()` et `toHaveComputedLabel` n'existent pas dans la WebView : lire `getText()`.
- Case DSFR (`fr-toggle__input`, `fr-checkbox`) : l'`<input>` est recouvert par son `<label for=id>` (clic refusé « element click intercepted ») et n'est pas « affiché » : cliquer le label, attendre avec `waitForExist`.
- Webapp : `driver.execute(() => window.location.reload())` échoue (« Cannot find context with specified id », WDIO 10 passe par BiDi et la page est détruite pendant l'appel) : `browser.refresh()`.
- Un clic perdu par un re-rendu concurrent (liste « Services ») : `clickButtonUntilGone` est une exception réservée aux clics dont la perte est avérée.
- Une liste rendue après un appel API : le titre de section peut s'afficher avant ses entrées.
- Webapp : un onglet dont le débogueur JS est en pause (DevTools ouvert sur cet onglet, breakpoint) bloque toute commande WebDriver qui exécute du script, sans indice, jusqu'au timeout Mocha. L'adaptateur borne `ensureAppWindow()` à 20 s (`ENSURE_APP_WINDOW_TIMEOUT_MS`, `browser.adapter.ts`) pour transformer ce blocage en erreur.
- Webapp, indépendamment : un partenaire OIDC peut ouvrir son flow dans un nouvel onglet, et les commandes suivantes partiraient dans le mauvais. L'adaptateur mémorise l'onglet de la SPA au départ (`captureAppWindow`) et y revient avant chaque `inWebContext`.
- Le délai Mocha se pose au niveau du `describe` : `this.timeout()` dans un `it` ou un hook est sans effet avec WDIO. Une connexion initiale peut durer ~105 s sur une machine lente : 180 s pour les specs de login.

### Contextes mobiles

- Une WebView apparaît ~1 s après le choix de l'environnement ; les métadonnées d'un contexte (titre, URL) retardent de plusieurs secondes sur iOS : attendre le titre visé avant de se rabattre sur la dernière WebView. Un worker (service worker) apparaît comme une cible `WEBVIEW_*` de plus : ce n'est pas une page.
- Android : plusieurs cibles partagent le même id `WEBVIEW_<package>`, seul `webviewPageId` les distingue (`switchContext` puis `switchToWindow`) ; le driver expose `attached` et `visible` par page. iOS : aucune visibilité exposée, lire `document.visibilityState` après `switchContext`. Le clic sur une notification native ouvre `/#/notifications` dans une WebView supplémentaire qui reste listée mais passe en `hidden`.
- iOS : le `scriptTimeout` retombe à ~0 ms à chaque changement de contexte (Android : 30 s) : le reposer.
- iOS : une fenêtre peut se fermer ou s'ouvrir pendant le flow OIDC, le handle devient périmé (« no such window ») : re-sélectionner le handle de la WebView choisie.
- Si le retour à `NATIVE_APP` échoue, la session reste en WebView et les requêtes natives suivantes échouent (« Unsupported locator strategy: -ios predicate string »). Sortir d'un `inWebContext` en laissant le contexte natif, sinon `inWebContext` ne rechoisit pas la bonne WebView.
- iOS : après un redirect OIDC, `$(sel)` peut dire « not found » alors que la page est rendue (arbre d'accessibilité WKWebView périmé) : `getPageSource()` force la resynchronisation (`execute(() => 0)` ne suffit pas).
- iOS : un clic qui change de document (FranceConnect, identifiants, retour à l'app) détruit la target WebKit ; une commande WebView envoyée juste avant ne reçoit jamais de réponse (120 s). Constater la disparition de la page quittée par l'arbre natif (`waitForNativeAx`, hors `inWebContext`) avant toute commande WebView.
- Geste natif de rafraîchissement (`pullToRefresh`) : hors `inWebContext` (la WebView intercepte le geste) ; iOS : préférer `window.location.reload()`, un `UIRefreshControl` bloque le swipe.
- La bannière SpringBoard s'anime puis disparaît : retrouver l'élément à chaque tentative de tap. Le contrôle d'un interrupteur iOS libellé est à son bord droit, le centre de la ligne tombe sur le texte.

### Capabilities et appareils

- L'appareil se désigne par `appium:udid` seul (`ANDROID_UDID`, `IOS_UDID`) ; `deviceName` ne sert pas à le choisir. Sans UDID, Android prend le premier appareil connecté ; iOS, sans udid ni `platformVersion`, prend le runtime le plus récent et peut créer un simulateur temporaire jetable très lent.
- `AMI_ENV` doit correspondre à l'app de `ANDROID_APP_PATH` / `IOS_APP_PATH` (preprod : package `fr.gouv.ami.preprod`, bundle `fr.gouv.ami.preproduction`).
- `noReset: true` : l'app reste installée entre deux specs, avec ses données. Elle est arrêtée à la fin de chaque session (`afterSession` : `force-stop` sur Android, `terminate` sur iOS) et relancée par la spec suivante. iOS : l'app lancée par WDA appartient au processus XCTRunner que le driver tue à chaque session ; la lancer par `simctl` avec `autoLaunch: false` fait perdre le bundleId à WDA (WebView introuvable). Piste non essayée : un WDA persistant (`webDriverAgentUrl`).
- iOS `isHeadless: true` : sinon chaque session ouvre une instance de DeviceHub (Xcode 26+, le driver ne le reconnaît pas).
- iOS `webviewConnectRetries` : le défaut du driver (20 × 500 ms) coûte ~10 s à chaque sonde `isWebContextAvailable()` sans WebView ; 3 essais suffisent, nos boucles sondent elles-mêmes.
- Android `chromedriverAutodownload: true` est requis pour `switchContext('WEBVIEW_*')`.
- Deux runs en parallèle : un appareil chacun, et des ports distincts (`ANDROID_SYSTEM_PORT`, `ANDROID_CHROMEDRIVER_PORT`, `IOS_WDA_PORT`, `*_APPIUM_PORT`).

### Connexion et onboarding

- Après la connexion FranceConnect (`login-callback`), l'app charge avant d'afficher son premier écran (un geo.api.gouv.fr lent retarde l'écran « clé d'accès ») : attendre ce premier écran plutôt que sonder par page et recharger la racine, ce qui interrompt le chargement.
- La page d'erreur technique FCP-LOW partage le bandeau du vrai formulaire de login : la détecter avant de conclure à « formulaire », sinon la boucle tourne jusqu'au délai. La mire eIDAS contient « FranceConnect » dans un lien de pied de page : chercher dans les `<button>`.
- Une session FranceConnect encore ouverte (SSO) renvoie directement vers l'app, sans mire eIDAS ni identifiants. La déconnexion de l'app (« Me déconnecter » du profil) ne termine pas la session FranceConnect ; seule la carte « Déconnexion FC » du catalogue de staging le fait. Ce n'est pas un échec : `loginWithFranceConnect` et `getAppToStartingState` l'acceptent et journalisent un avertissement. Le test d'authentification est le premier spec à tourner ; il se déconnecte de l'app dans son `before` (`getAppToLoggedOutState`, qui choisit aussi la revue app puis attend l'écran de connexion ou une session).
- Cookie de session `token` : HttpOnly, invisible pour `document.cookie`, lisible par WebDriver (`browser.getCookies`) et seulement depuis l'origine du backend ; ailleurs, la réponse est « inconnu », pas « déconnecté ». iOS le garde d'un démarrage à l'autre.
- Android, FranceConnect : le bouton est normalement natif mais la SPA peut aussi rendre le sien ; après le tap natif, la page de login de la SPA peut demander un 2e tap ; après une déconnexion la WebView reste sur `/?is_logged_out#/` (page vide), seul un chargement complet de la racine redirige vers `#/login`.
- iOS, onboarding des notifications : la feuille native SwiftUI et la page SPA `/#/welcome/notifications` sont toutes deux dans l'arbre natif, mêmes libellés (`hittable == 1` ne garde que la feuille). Si la permission est déjà décidée, la feuille ne vient pas et la route reste vide : seul un rechargement de la racine en sort, et seul « Peut-être plus tard » ferme. Le tap sur « Peut-être plus tard » est parfois sans effet : retaper (3 fois). L'app re-présente la feuille à chaque lancement tant que la permission est non décidée, et elle peut recouvrir l'accueil (accueil lisible, WebView muette) : la fermer d'abord. Après l'alerte système, le sélecteur d'environnement revient seul : re-choisir l'environnement, le cookie rouvre l'accueil.
- Une page d'onboarding qui revient après 3 fermetures ne se ferme pas : échouer. Attendre qu'elle ait quitté l'écran avant de réobserver, sinon elle est comptée comme un retour. Les pages d'onboarding (zones, passkey) sont conditionnelles : `dismiss()` est sans effet si elles sont absentes.
- Sélecteur d'environnement natif : la tuile « Staging » contient deux textes identiques, viser la tuile entière. Sa sonde est la seule à relancer une violation du mode strict, l'avaler la fait passer pour « picker absent ». Android : la liste Compose n'est pas un `android.widget.ScrollView` (`scrollable(true)` en `scrollableElement`) ; un swipe coûte plus de 10 s, 5 au plus.
- Menu « Plus » (dialogue DSFR) : un clic juste après un changement de page est perdu, le rejouer tant que le dialogue n'est pas ouvert et affiché. En webapp il reste parfois ouvert après le login et intercepte le clic suivant.

### Données et pages de la SPA

- Le fc_hash utilise `family_name`, le nom de **naissance**, et un `birthplace` vide pour une naissance à l'étranger.
- Suivi : pas d'abonnement temps réel, recharger la page à chaque tentative pour une démarche déjà listée. Le h2 « Mes démarches » existe aussi sur l'Accueil : vérifier l'arrivée par le h1. L'accordéon « Votre démarche n'apparaît pas ? » est déplié au chargement : ne cliquer que s'il est replié.
- Profil : « Mon identité » affiche le nom FranceConnect et ne reflète pas le nom d'usage modifié : lire le champ du formulaire d'édition. Les 3 boutons « Modifier » ont même rôle et même texte : `data-testid`. Une adresse vide est un état légitime. Après la déconnexion, `$()` et non l'élément cliqué.
- Consentements aux démarches : par partenaire (case de Préférences > Suivi des démarches) ; le backend refuse les événements d'un partenaire à consentement activé sans consentement. « Tout suivre » active toutes les cases : restaurer toutes celles du snapshot. Les notifications push sont un réglage global, local à l'app, sans API.
- Agenda : le seul lien entre le titre d'un élément (`h4 > button`) et son bouton de modale est leur `div` commun ; le nom du bouton « Masquer » contient le titre : `data-testid`.
- Carrousel Splide de l'accueil : la flèche « suivante » se cible par classe (son nom change en bout de boucle) et se reconstruit après chaque clic.
- Services : le défilement WDIO laisse la dernière entrée sous la barre basse (clic intercepté) : `scrollIntoView({block: 'center'})` en JavaScript. Le clic vers une cible qui ne répond pas doit être un clic JavaScript : le clic WebDriver attend la fin du chargement (>120 s) puis échoue (« stale element reference »).
- Listes d'étapes : les boutons-liens mesurent 0×0 px (« lien étiré » DSFR) et ne sont pas « affichés » : lecture par `execute`, clic par `HTMLElement.click()`. Le type d'item n'est lisible que dans son `data-testid`.
- Cible externe sortant de la SPA : ne jamais exposer l'URL complète (jeton `caller`, `id_token`), décrire hôte, chemin et titre. iOS : le lien externe s'ouvre dans une seconde WKWebView restée sur `about:blank` (domaine de test jamais résolu) : l'URL tentée n'est pas observable.
- Contrôle de liens : une cible injoignable (hôte privé hors VPN) ne rend la main qu'après le délai de connexion du navigateur (~75 s).

### Notifications

- Le push natif est émis par le backend (FCM sur Android, FCM → APNs sur iOS, simulateur compris), pas par `simctl push`. La notification n'est postée que si `POST_NOTIFICATIONS` est accordée ; livraison FCM de 45 à 70 s sur l'émulateur. Le `PendingIntent` Android est réutilisé d'une notification à l'autre : les extras de l'intent sont ceux de la première.
- iOS staging : le tap sur la bannière crée la WebView `/#/notifications` mais elle reste `hidden`, l'ancien accueil reste visible : pas d'assertion forte sur la page Notifications. Revenir à l'accueil sans `goToRoute('/')` (écran blanc dans la WebView cachée).
- iOS : `simctl privacy` ne gère pas les notifications. La décision de l'utilisateur est dans `<simulateur>/data/Library/BulletinBoard/VersionedSectionInfo.plist` (`authorizationStatus` : 0 non décidée, 1 refusée, 2 autorisée, 3 provisoire ; section absente tant que l'app n'a rien demandé). L'interrupteur de l'app ne lit l'autorisation système qu'au passage en premier plan : faire un aller-retour SpringBoard → app avant de le lire. Refuser ou accepter après un refus ouvre Réglages (l'alerte ne se représente plus), qui garde sa dernière position.
- Inbox : la liste se met à jour en place par le WebSocket de la page, un `reload` le fermerait : l'ouvrir avant de publier. iOS : quitter l'inbox (centaines de notifications) avant les opérations natives, car le service de trace lit le source natif et bloque la file d'Appium ~2 min. Rester dans la WebView pendant tout l'épisode concerné.

### Rapports

- Sentry : les review apps de PR n'ont pas d'environnement connu dans le filtre du lien de trace, leur trace peut être masquée. Le trace id change à chaque chargement de page, `lastEventId` vaut `null` sans erreur capturée, les apps natives n'ont pas d'intégration Sentry.
- Le dump d'échec ne change jamais de contexte (iOS : blocage ~25 s).
