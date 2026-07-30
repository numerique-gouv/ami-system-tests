# Contribuer aux tests E2E AMI

Ce document rassemble les **règles générales** à suivre pour écrire ou modifier un test. Pour installer, lancer les
tests ou déboguer, voir le [README](README.md). Les cas particuliers (un seul écran, une seule méthode concernée) ne
sont **pas** ici : ils sont documentés en commentaire directement dans le fichier de code concerné.

## Sommaire

1. [Page Objects — architecture 3 niveaux](#1-page-objects--architecture-3-niveaux)
    - [1bis. Logging](#1bis-logging)
2. [Sélection des éléments](#2-sélection-des-éléments)
3. [Cycle complet d'une « tuile » par type de page](#3-cycle-complet-dune-tuile-par-type-de-page)
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
src/tests/          scénarios Mocha — zéro sélecteur, zéro if(driver.isIOS)
src/pages/           Page Objects — logique métier, dispatch via getXxxLocators()
src/pages/locators/  sélecteurs par plateforme + fonction getXxxLocators()
```

### Niveau 1 — `locators/*.locators.ts`

Un fichier par page. Une interface TypeScript des locators, un objet `androidXxxLocators`, un objet `iosXxxLocators`,
une fonction `getXxxLocators()` qui dispatche selon `driver.isIOS`.

```typescript
export const androidLoginLocators: LoginLocators = {
    fcButton: '~franceConnect button', // accessibility id Android
    fcButtonInWebView: false,
}
export const iosLoginLocators: LoginLocators = {
    fcButton: "button=S'identifier avec FranceConnect",
    fcButtonInWebView: true, // le bouton est dans la WebView SPA sur iOS
}

export function getLoginLocators(): LoginLocators {
    return driver.isIOS ? iosLoginLocators : androidLoginLocators
}
```

**Exception : locators identiques sur les deux plateformes.** Quand une page est entièrement en WebView avec un DOM
identique iOS/Android, exporter un seul objet partagé plutôt que deux objets dupliqués — `getXxxLocators()` reste la
seule API appelée par le Page Object, même si elle ne dispatche plus rien. **Ne pas fusionner par anticipation** : si un
seul champ diverge un jour, repasser au dual-object plutôt que d'ajouter un `driver.isIOS ? ... : ...` ponctuel dans
l'objet partagé.

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur direct** — appel à `getXxxLocators()` à chaque méthode.
- Les requêtes Testing Library sont inline dans le Page Object, **pas** dans le fichier locators (elles n'ont de sens
  qu'en WebView).
- Exporté comme singleton tracé : `export default traced(new XxxPage(), 'XxxPage')`.
- `if (driver.isIOS)` acceptable **seulement** quand le *comportement d'interaction* diffère vraiment (pas juste le
  sélecteur) — ex. submit de formulaire OIDC (fallback `driver.execute` sur iOS pour le bug WKRDP, inutile sur Android),
  clic JS vs pointer events, attente post-redirect.
- **Avant d'écrire un branchement plateforme**, chercher si un signal DOM/WebView commun couvre déjà les deux cas (ex.
  la disparition d'une modale de confirmation est un événement observable identiquement sur iOS et Android — pas besoin
  de détecter la fin d'un logout différemment par plateforme).
- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'page-object'`), voir
  [§1bis Logging](#1bis-logging).

### Niveau 3 — `tests/*.test.ts`

Appelle uniquement des méthodes de Page Object. Le test se lit comme un scénario métier, sans détail d'implémentation ni
sélecteur.

- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'test'`), voir
  [§1bis Logging](#1bis-logging).

---

## 1bis. Logging

**Jamais `console.*`** dans le code qui tourne dans une session WDIO/Mocha (pages, tests, helpers appelés par ce code,
hooks de config) — utiliser `@wdio/logger`, qui s'intègre au flux de logs WDIO/Allure (`addConsoleLogs: true` dans
`wdio.base.conf.ts`) :

```typescript
import logger from '@wdio/logger'

const log = logger('<namespace>')
```

N'ajouter cette constante que dans les fichiers qui l'utilisent réellement — `no-unused-vars` est une erreur de lint,
pas un avertissement.

Un namespace par couche, tous activés à `'info'` dans `logLevels` (`wdio.base.conf.ts`) même quand le niveau global est
`'warn'` :

| Couche                                                          | Namespace     |
|-----------------------------------------------------------------|---------------|
| `pages/*.page.ts` (via `traced()`)                              | `page-object` |
| Hooks globaux `wdio.base.conf.ts`                               | `scenario`    |
| `tests/*.test.ts`                                               | `test`        |
| `helpers/*-api.ts` (clients HTTP)                               | `api`         |
| `wdio.android.conf.ts` / `wdio.ios.conf.ts` (`onPrepare`, etc.) | `config`      |
| Autres `helpers/*.ts` appelés en session                        | `helper`      |

**Exception : scripts CLI et REPL hors session de test.** `src/scripts/*.ts` (lancés via `just` en dehors d'une suite
WDIO, ex. `push-notification.ts`, `inspect-webview.ts`) ainsi que
`src/helpers/repl.ts` et `src/helpers/inspect.ts` (sortie destinée à un humain dans le REPL
`browser.debug()`) restent en `console.*` : `@wdio/logger` n'apporte rien hors du flux WDIO/Allure, et cette sortie est
un affichage terminal direct, pas un log de scénario.

---

## 2. Sélection des éléments

**Par défaut, sélectionner par le sens perçu par l'utilisateur**, pas par la structure DOM :

- **WebView** — Testing Library via `tl()` (`getByRole`, `findByText`, `findByLabelText`…), toujours à l'intérieur de
  `withWebView()`.
- **Natif** (hors WebView) — `accessibility id` (`~xxx`) de préférence à un XPath par texte ou un resource-id brut.

### Règle canonique : `tl()` vs `driver.execute()`

`tl()` repose sur `executeAsync` (Testing Library) : un appel qui peut être **tué** si une navigation SPA ou un re-rendu
concurrent interrompt l'event loop pendant l'attente — d'où des `stale element` ou des timeouts en apparence aléatoires.
`driver.execute()` est un JS **synchrone** : find + lecture/action dans le **même** appel, donc atomique et résistant à
un re-rendu concurrent.

```typescript
// Page qui se met à jour en tâche de fond (WebSocket) : lecture atomique, pas $$()+.getText()
// Appel de vérification que la page est bien présente et disponible, pour les tl() ne soient pas fait trop tôt
const title = await driver.execute(() => {
    const el = document.querySelector('h1, h2, h3, [role="heading"]')
    return el ? el.textContent?.trim() : ''
})
```

- **Interactions sur page stable** (formulaire, bouton, une fois la destination confirmée) → `tl()`.
- **Sentinelles de navigation, pages mises à jour en WebSocket, find+action dans une boucle de polling** →
  `driver.execute()`.
- Les sélecteurs CSS utilisés dans les callbacks `driver.execute` sont centralisés dans
  `pages/locators/*.locators.ts`, pas codés en dur inline.
- Sur une page stable, hors des sentinelles de navigation, quand tl () ne permet pas de sélectionner une tuile, préférer
  les méthodes WDIO standard (`$$()`, `.getText()`) à un callback `driver.execute` manuel dès que la logique s'exprime
  avec l'API WDIO — ne pas réinventer en JS ce que WDIO fait déjà. e.g. Les cas de tuile de notifications ou l'on trouve
  les tuiles par leurs classes CSS et on veut trouver leur titre et d'autres attributs à l'intérieur.
  `$$()` capture une liste de handles d'éléments à un instant T — si la page se re-rend (WebSocket, re-rendu réactif
  concurrent) entre cette capture et la lecture de chaque élément, la commande suivante lève un
  `stale element reference`. `$()` seul, jamais pré-`await`é, ne souffre pas de ce risque : il ré-résout le sélecteur à
  chaque commande via le protocole WebDriver standard, sans handle figé.
  `driver.execute` reste réservé aux pages où cette fenêtre de staleness `$$()` est un risque réel (mise à jour
  WebSocket concurrente), pas à la navigation SPA elle-même (ce risque-là concerne `tl()`).

  ```typescript
  // ✅ Une seule boucle : identifie ET asserte dans le même waitUntil, $$() + .getText()
  await browser.waitUntil(async () => {
    for await (const card of $$(loc.cardContent)) {
      const titleText = await card.$(loc.cardTitle).getText().catch(() => '')
      if (!titleText.includes(title)) continue
      const status = (await card.$(loc.cardBadge).getText().catch(() => '')).trim().toLowerCase()
      return status.includes(statusLabel.toLowerCase())
    }
    return false
  }, { timeout: 20000, interval: 2000, timeoutMsg: `Démarche "${title}" non trouvée` })

  // ❌ driver.execute + textContent réimplémente ce que $$().getText() fait déjà, et re-parcourt
  //    le DOM une fois par critère (titre, puis statut, puis URL séparément)
  driver.execute((contentSel, titleSel, badgeSel, t) => {
    const cards = Array.from(document.querySelectorAll(contentSel))
    const card = cards.find(c => c.querySelector(titleSel)?.textContent?.includes(t))
    return (card?.querySelector(badgeSel) as HTMLElement | null)?.innerText?.trim() ?? ''
  }, loc.cardContent, loc.cardTitle, loc.cardBadge, title)
  ```

### `innerText` vs `textContent`

- `textContent` pour **identifier** un élément dans le DOM brut (indépendant du CSS).
- `innerText` pour **asserter un état visible** — il respecte `display:none`/`visibility:hidden`, donc il reflète ce
  qu'un utilisateur voit réellement. Si un QA humain peut confirmer l'état en lisant l'écran, utiliser `innerText`.

### `data-testid` : dernier recours documenté

Avant d'ajouter un `data-testid`, essayer `tl().getByRole()`/`findByText()` et ne basculer que si cette requête échoue
**réellement**. Documenter alors l'échec observé en commentaire à côté du champ (pas « structure observée via
`just inspect` »). Deux cas justifiés : rôle+nom dupliqués sur la page, ou texte imprévisible (contenu dynamique).

### Classes CSS : DSFR oui, Svelte hashé non

Avant d'ajouter un `fr-*`, essayer `data-testid`. Les classes du design system État (`fr-tile__content`, `fr-badge`,
`fr-tabs__tab--selected`) sont un contrat stable, utilisables comme sélecteur. Les classes générées par Svelte
(`svelte-19k7n5y`) sont un détail d'implémentation qui change à chaque build — **jamais** les utiliser comme sélecteur.

---

## 3. Cycle complet d'une « tuile » par type de page

Cinq étapes communes à toute interaction sur un composant de page : **1.** vérifier qu'il est affiché ET interactif ·
**2.** lire son contenu · **3.** remplir un champ qu'il contient · **4.**
cliquer son bouton · **5.** ne pas vérifier sa disparition.

Les pages se recyclent, les résolution post-recyclage génèrent des warning bénin **ET attendent la durée du timeout**,
donc du bruit qui ralentit.

### Écran natif — `$()` obligatoire (pas de `tl()`/`driver.execute` possible)

Ni `tl()` ni `driver.execute()` n'ont de prise sur les éléments natifs XCUITest/UiAutomator2 (pas de moteur JS côté
natif) — `$()`/`$$()` avec des sélecteurs natifs y sont donc obligatoires, pas un choix de style.

```typescript
// Pas de await sur $(), permet de re-résoudre la promise à chaque appel et résister aux changement de navigation
const tile = $(loc.pickerTile)
await tile.waitForClickable({timeout: 15000})

const label = await tile.getText()

await $(loc.tileInput).setValue('valeur')

await tile.click()

```

### WebView stable & WebView avec redirection OIDC (une fois stabilisée) — `tl()` en priorité

Même code dans les deux cas dès que la page ne bouge plus.

```typescript
await withWebView(async () => {
    const editBtn = await tl().findByRole('button', {name: 'Modifier'})
    await editBtn.click()

    const input = await tl().findByLabelText("Nom d'usage")
    const currentValue = await input.getValue()

    await input.setValue('Nouvelle valeur')

    const submitBtn = await tl().findByRole('button', {name: 'Enregistrer'})
    await submitBtn.click()

})
```

### Attendre une information asynchrone (backoff exponentiel) — `driver.execute` en priorité

Cas d'une donnée qui arrive côté backend sans mécanisme de push testé (ex. notification publiée via l'API) : on ne peut
pas attendre un événement, on **poll** avec un rafraîchissement explicite à chaque tentative — backoff exponentiel, un
`withWebView` minimal par essai, rafraîchissement natif par plateforme (`pullToRefresh` Android, `location.reload()`
iOS — l'`UIRefreshControl` iOS peut bloquer le geste de swipe).

Le rafraîchissement lui-même diverge par plateforme, pas seulement le sélecteur : sur iOS, le
`reload()` se fait **dans** la WebView (`window.location.reload()` via `driver.execute`) ; sur Android,
`pullToRefresh()` est un geste natif (hors WebView), suivi d'une lecture en WebView. Ce n'est donc pas un cas de
sélecteur partagé (§2) — le `if (driver.isIOS)` est justifié par un comportement d'interaction réellement différent (§1,
niveau 2).

```typescript
// Extrait de notifications.page.ts — assertNotificationReceived()
const backoffMs = [0, 500, 1000, 2000, 4000, 8000]
let elapsed = 0
for (const delay of backoffMs) {
    await browser.pause(delay) // hors withWebView : WebView libre de recevoir la WebSocket
    elapsed += delay
    let found = false
    if (driver.isIOS) {
        // la WKWebView a peut-être un UIRefreshControl qui bloque le refresh avec swipe down (pullToRefresh)
        await withWebView(async () => {
            await driver.execute(() => window.location.reload())
            // Après un reload, les appels pour vérifier que la page est chargée peuvent s'appliquer sur
            // la page en train de disparaitre. On contourne ce problème en cherchant le nouvel élément
            // que l'on poll — l'autre option serait de tester que la date de la page a changé
            // (driver.execute(() => performance.timeOrigin) as unknown as Promise<number>).
            found = await browser.waitUntil(
                async () => driver.execute(
                    (text) => Array.from(document.querySelectorAll<HTMLElement>('*'))
                        .some(el => el.children.length === 0 && el.textContent?.trim() === text),
                    title
                ) as unknown as boolean,
                {timeout: 1000, interval: 100}
            ).catch(() => false)
        })
    } else {
        await pullToRefresh() // geste natif driver.action('pointer'), hors withWebView
        found = await withWebView(() =>
            tl().findByText(title, {}, {timeout: 500}).then(() => true).catch(() => false)
        )
    }
    if (found) {
        log.log(`[notifications] reçue (≤ ${elapsed} ms)`)
        return found
    } else {
        log.log(`[notifications] toujours pas reçue  (≤ ${elapsed} ms)`)
    }
}
// AssertionError, pas Error : ce timeout signale que l'application n'a pas fait ce qui est
// attendu d'elle (la notification n'est jamais arrivée), pas un problème d'infra — cf. §8.
throw new AssertionError({message: `Notification not received:${title}.`})
```

Le choix détaillé de l'API par type de page et par action (avec le raisonnement complet) est archivé dans l'ADR
`docs/adr/selection-strategy-catalog.md` — ce document-ci n'en garde que la règle opérationnelle et les trois squelettes
ci-dessus.

---

## 4. WebView et contextes

- **`withWebView()` est la seule façon d'entrer en WebView** — jamais `driver.switchContext()`
  directement. `withWebView()` garantit le retour en `NATIVE_APP` dans un `finally`, même en cas d'exception.
- Les sélecteurs CSS/XPath ne fonctionnent qu'en `WEBVIEW_*` ; les gestes natifs (swipe, pull-to-refresh) et les
  sélecteurs natifs ne fonctionnent qu'en `NATIVE_APP`. Un geste natif **ne doit jamais** être appelé depuis l'intérieur
  d'un `withWebView()`.
- **Flow OIDC FranceConnect : un seul `withWebView()`** pour tout le flow (eIDAS → identifiants → callback). Cas
  particulier documenté : sortir du contexte WebView au milieu de *ce flow précis*
  provoque un blocage ~25 s sur iOS — ce n'est pas une règle générale de couplage navigation/sentinelle (cf. points
  suivants), c'est une contrainte technique propre à ce flow OIDC.
- **Responsabilité de la navigation** : la méthode qui navigue appartient à la Page Object *source*, pas à la
  destination. La vérification d'arrivée sur la page cible appartient à la page cible. Chaque méthode de la page cible
  doit avoir une sentielle (trouve un élément visible de la cible) avant de faire son travail.
- **Chaque méthode publique d'un Page Object doit s'assurer, avant d'utiliser `tl()` ou un sélecteur natif, qu'elle est
  bien sur l'écran attendu** — via une sentinelle (élément visible de la page), jamais via `window.location.hash` (le
  hash peut être mis à jour avant que le contenu soit rendu). Cette vérification est systématique en entrée de méthode,
  que la page soit en natif ou en WebView, et que la méthode vienne d'être appelée juste après une navigation ou non —
  c'est elle, pas un couplage artificiel avec l'appel qui a navigué, qui garantit qu'on n'agit jamais sur une page pas
  encore chargée.
- Naviguer par un vrai clic utilisateur (`$(sel).click()` après `waitForClickable()`, ou Testing Library) plutôt que
  `driver.execute(() => el.click())` — le clic JS est silencieux sur iOS en cas d'échec. Réserver
  `driver.execute(?.click())` aux sentinelles, pas à la navigation principale.

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
  `await expect($(loc)).toBeDisplayed()`. Jamais devant une valeur déjà résolue (`string`/`boolean`/`number`) — ça
  déclenche l'avertissement TypeScript `[80007]` et n'a aucun effet.
- **`waitUntil` : toujours passer `timeoutMsg`.** Sans lui, le rapport Allure ne montre qu'un cryptique « Timeout
  exceeded ».
- **Asserter une absence via `waitUntil`, jamais par un check immédiat** — après une action qui change l'état, la SPA a
  besoin d'un cycle de rendu ; un check immédiat produit souvent un faux positif (l'élément est encore dans le DOM).
- **Fusionner les vérifications séquentielles sur un même item.** Dès qu'un scénario doit vérifier N critères sur le
  même élément/la même liste, écrire une seule méthode de Page Object qui les vérifie tous dans le même `waitUntil`,
  avec une variable d'état (`failReason`) qui capture jusqu'où l'attente est allée avant d'échouer — pas N méthodes à un
  seul critère chacune (deux sources de flakiness au lieu d'une, et un message d'échec qui ne dit pas lequel des deux
  critères a échoué).
- **Ne pas doubler `waitForDisplayed` et `isDisplayed`** — `waitForDisplayed`/`waitForVisible`
  garantit déjà l'affichage ; un `isDisplayed()` qui suit immédiatement est redondant.
- Dans la WebView, les éléments ne survivent pas à un switch de contexte : utiliser `driver.execute()`
  ou Testing Library dans `withWebView()`, pas les matchers WDIO natifs.

---

## 6. Isolation des tests

Deux niveaux d'isolation : entre fichiers de spec (session Appium fraîche, automatique) et entre
`it()` d'un même fichier (`before` vs `beforeEach`, à choisir).

```
Les tests modifient l'état ?
  ├── oui et reset bon marché (terminateApp) → beforeEach
  └── non ou reset coûteux (login OIDC)     → before + cleanup explicite (after)
```

- **`before`** : navigation coûteuse faite une seule fois (onboarding, login OIDC ~30 s). Convient si les tests ne
  modifient pas l'état global, ou si un test qui échoue ne pollue pas les suivants.
- **`beforeEach`** : reset strict avant chaque test. Convient dès qu'un test modifie l'état de l'app, ou que
  l'onboarding doit être rejoué. `driver.reset()` est **déprécié** dans Appium 3 — utiliser
  `terminateApp` + `activateApp` (conserve l'installation, reset l'état mémoire) ou `fullReset: true`
  en capability pour une réinstallation complète.
- **Indépendance des `it()` : règle absolue.** Chaque `it()` doit pouvoir s'exécuter dans n'importe quel ordre et en
  isolation. Un `it()` qui modifie l'état doit le remettre dans l'état initial (dans le test lui-même, ou dans
  `afterEach`).
- **Exception documentée : cycle de vie d'une entité backend.** Quand des `it()` testent les états successifs d'une même
  entité côté API (`new → wip → closed`), la dépendance entre `it()` est structurelle. Dans ce cas : documenter
  explicitement la dépendance en commentaire du `describe` ; utiliser un identifiant unique horodaté ; chaque `it()`
  publie ses propres notifications et valide son état sans supposer l'état *local de l'app* laissé par le `it()`
  précédent ; vérifier que
  `specFileRetries` rejoue bien tout le fichier (nouvelle session → `before` rejoué), pas un `it()`
  isolé.
- **Un test ne fait jamais `xcrun simctl` ni `adb` directement.** Il s'appuie sur l'environnement préparé par `just`
  (émulateur/simulateur démarré, app installée, hook `beforeSession` côté Android). Ça garantit la portabilité (CI,
  machines différentes) et centralise la chaîne de préparation dans le `justfile`.
- **Idempotence backend** : un test qui publie des données (notification, post) doit utiliser un identifiant/titre
  unique horodaté (`` `AMI-vanilla-${Date.now()}` ``) — sinon un backend qui fait un
  `get_or_create` sur le payload retourne le record d'un run précédent au lieu d'en créer un nouveau.

---

## 7. Stratégies de retry

Trois niveaux, à ne pas confondre :

| Niveau          | Mécanisme               | Session Appium              | Quand l'utiliser                               |
|-----------------|-------------------------|-----------------------------|------------------------------------------------|
| **Spec**        | `specFileRetries`       | Fraîche (nouveau processus) | Instabilité environnement (simulateur, réseau) |
| **Applicatif**  | Retry dans le code      | Conservée                   | API tiers cold-start (5xx transitoires)        |
| **Page Object** | `try/catch` dans le POM | Conservée                   | Élément instable post-redirect                 |

- **Éviter `mochaOpts.retries`.** Il relance le `it()` dans la **même** session Appium : l'état de l'app peut être
  corrompu (onboarding à moitié passé, token expiré), les logs Appium du premier essai restent dans le même flux (Allure
  ne peut pas distinguer les tentatives), et un bug réel qui passe au 2e essai devient invisible. `specFileRetries`
  relance le fichier entier dans un nouveau processus avec une session fraîche et des logs propres par tentative.
- **Retry applicatif** (backend cold-start type Scalingo/Heroku) : retry sur 5xx uniquement, jamais sur 4xx (erreur
  client, non transitoire).
- **Retry court en Page Object** (élément instable qui réapparaît brièvement, ex. bouton FranceConnect en fin de
  redirect OIDC) : le `catch` best-effort **ne doit jamais être totalement silencieux** — logger avec `log.warn()` (voir
  §1, jamais `console.warn`) conditionné au cas attendu documenté. Un
  `catch {}` vide masque un vrai bug (sélecteur cassé, timeout réseau) derrière un « comportement normal ».
- **Ne pas retrier les `findBy*` de Testing Library** — ils intègrent déjà une attente interne (`timeout` en 3e
  argument). Augmenter ce timeout plutôt que d'enrouler l'appel dans une boucle de retry manuelle.

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
- **`expect(...).toXxx()` reste le premier choix** dès qu'un matcher `expect-webdriverio` existe pour le cas — il lève
  déjà le bon type en interne. `AssertionError` explicite est réservé aux échecs métier qui ne passent pas par un
  `expect()` : sortie d'une boucle de backoff (`waitForDemarche`,
  `assertNotificationReceived`), réponse HTTP inattendue d'une API partenaire (`publishNotification`), élément de
  confirmation attendu absent.
- **`throw new Error(...)` reste réservé au technique** : contexte `WEBVIEW_*` introuvable (`withWebView`), variable
  d'environnement manquante (`requireEnv`) — un humain doit corriger la configuration ou l'environnement, pas relire le
  comportement de l'app.

```typescript
import {AssertionError} from 'node:assert'

// ✅ Erreur de test — l'API partenaire a répondu, mais avec un statut d'échec après épuisement des
// retries applicatifs (cf. §7) : ça révèle un vrai problème d'application/API, pas un test cassé.
lastError = new AssertionError({message: `PUT /api/v2/event → HTTP ${response.status}: ${text}`})

// ✅ Erreur technique — rien à voir avec l'application : la WebView n'existe pas, il faut corriger
// les capabilities Appium ou l'environnement, pas enquêter sur un comportement métier.
throw new Error(
    `Aucun contexte WEBVIEW_* trouvé après ${WEBVIEW_WAIT_MS}ms. Contextes disponibles : [${contexts.join(', ')}].`
)
```

---

## 9. Rapports Allure

- **`addFeature` et `addSeverity` sont obligatoires** dans chaque `describe` ou `it` — ils permettent le filtrage par
  feature/sévérité en CI. `addStory` et `addTag` sont optionnels.
- **`addStep`** pour découper un scénario long en étapes métier — chaque étape regroupe dans Allure les commandes qui
  lui appartiennent, avec un indicateur pass/fail par étape.
- **`addAttachment`** pour joindre une donnée de debug utile en cas d'échec (réponse API, URL courante, screenshot
  ponctuel avant un clic fragile) — au-delà du screenshot automatique déjà pris par le hook `afterTest`.

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

La configuration du reporter (`outputDir`, `disableWebdriverStepsReporting`, `addConsoleLogs`) est commentée directement
dans `wdio.base.conf.ts`. La commande pour générer et ouvrir le rapport est documentée dans le [README](README.md).

---

## 10. Règles de débogage

- **Observer avant d'écrire un sélecteur** — inspecter l'écran réel (`just inspect`) plutôt que deviner un sélecteur «
  qui devrait marcher ».
- **Ne jamais commiter un locator ou un workaround qui n'a pas été validé** en exécution réelle. Un commit de workaround
  hypothétique casse silencieusement un autre cas. Tester d'abord, puis commiter avec un message qui décrit le
  **pourquoi** (bug WKRDP, AX tree périmé, etc.), pas seulement le *quoi*.
- **Toggles de debug** (`logLevel: 'info'`, `specFileRetries: 0`) : tolérés commités tant que la suite est en
  développement actif, pour faciliter le diagnostic quotidien. Repasser à
  `logLevel: 'warn'` / `specFileRetries: 1` lors de la mise en CI.
- Avant toute session de débogage approfondie, regarder le dernier rapport Allure et les logs Appium (`.wdio-logs/`) —
  souvent suffisant pour identifier la commande qui a échoué sans avoir à relancer en `logLevel: 'debug'`.

La boucle d'inspection interactive (`browser.debug()`, REPL, `listInteractive()`) et le détail des commandes `just` sont
documentés dans le [README](README.md).
