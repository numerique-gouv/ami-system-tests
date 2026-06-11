# Mise au point interactive d'un scénario WDIO (iOS + Android, natif + WebView)

## 1. Pourquoi cette boucle ?

Les apps AMI sont hybrides : une partie de l'UI est **native** (bottom bar, alertes système, onboarding), l'autre est une **WebView** contenant la SPA Svelte. Appium expose ces deux parties comme deux contextes distincts :

| Contexte | Éléments visibles | Sélecteurs qui marchent |
|---|---|---|
| `NATIVE_APP` | Composants natifs Android/iOS | `~<accessibility id>`, XPath UiAutomator2/XCUITest |
| `WEBVIEW_*` | DOM de la SPA | CSS, Testing Library, XPath HTML |

Le cycle classique "modifier un locator → relancer `just test-android`" coûte **≈ 60 s** (boot émulateur, install, login FranceConnect, navigation). Pour trouver le bon sélecteur il faut souvent 3 à 5 cycles.

La solution : **`browser.debug()`** suspend le test en cours et ouvre un REPL Node directement dans la session Appium vivante. `browser`, `driver`, `$`, `$$` sont disponibles, plus un set de helpers projet (`listInteractive`, `withWebView`, `webViewInfo`, `refreshAxTree`, `getContexts`, `saveScreenshot`, `listInteractiveAll`). Taper **`help()`** dans le REPL pour voir la liste à jour. On inspecte, on essaie, on re-inspecte — sans jamais relancer la session.

## 2. Prérequis

```bash
# App déjà buildée et installée sur l'émulateur/simulateur
just build-android    # ou just build-ios

# Démarrer l'émulateur ou le simulateur
just start-android    # ou just start-ios
```

Optionnel mais recommandé : exporter `WDIO_DEBUG=1` avant le run pour désactiver le timeout Mocha (2 min par défaut). Sans ça, Mocha tue le test si tu passes plus de 2 min dans le REPL.

```bash
export WDIO_DEBUG=1
```

## 3. La boucle étape par étape

### Étape 1 : Écrire un test scratch

Dans `webdriverio/src/tests/`, créer (ou modifier temporairement) un test qui navigue jusqu'à la page à explorer, puis appeler `browser.debug()` :

```ts
it('debug — explorer la page notifications', async () => {
  await LoginPage.loginViaFranceConnect()
  await HomePage.waitForSpaReady()
  await NotificationsInboxPage.openFromHome()
  await browser.debug()  // ← le test se suspend ici, le REPL s'ouvre dans le terminal
})
```

### Étape 2 : Lancer le test

```bash
WDIO_DEBUG=1 just test-android "debug — explorer"
# ou :
WDIO_DEBUG=1 just test-ios "debug — explorer"
```

Le terminal affiche :

```
The execution has stopped!
You can now go into the browser or use the command line as REPL
(To exit, press ^C again or type .exit)

>
```

### Étape 3 : Boucle d'inspection dans le REPL

**Tout commencer par `help()`** pour voir les helpers disponibles dans la session courante.

**Vérifier dans quel contexte on est :**

```js
> await getContexts()
[ 'NATIVE_APP', 'WEBVIEW_fr.gouv.ami.staging' ]
```

**Lister les éléments natifs (contexte courant) : soit pour les pages antives, soit pour les overlay au-dessus des webviews **

```js
> await listInteractive()
// → tableau : N°, Ctx, Rôle, Label, Locator suggéré
```

**Lister les éléments de la WebView :**

```js
> await withWebView(async () => await listInteractive())
// → tableau des éléments du DOM WebView
```
**La WebView est-elle vraiment visible (vs cachée derrière un overlay natif) ?**

```js
> await webViewInfo()
// → { url: 'https://...', visible: 'visible' | 'hidden', title: '...' }
```

**Tester un locator natif :**

```js
> await $('~Notifications').click()
// ou
> await $('~Notifications').isDisplayed()
```

**Tester un locator WebView :**

```js
> await withWebView(async () => {
    const el = await tl().findByRole('link', { name: /Notifications/i })
    await el.click()
  })
```

**Re-lister après une interaction :**

```js
> await listInteractive()                                        // natif
> await withWebView(async () => await listInteractive())         // WebView
```

**Prendre un screenshot pour voir l'état visuel :**

```js
> await saveScreenshot()              // → /tmp/debug-<timestamp>.png
> await saveScreenshot('inbox-empty') // → /tmp/inbox-empty.png
```

### Étape 4 : Quitter

```
> .exit
```

Ou `Ctrl-C` deux fois. Le test reprend (et échoue proprement) ou la session se ferme.

### Étape 5 : Recopier les locators validés

Copier les valeurs de la colonne "Locator suggéré" dans les fichiers `src/pages/locators/*.locators.ts`, en suivant `guidelines/semantic-locators.md`.

**Ne jamais commiter un locator qui n'a pas été validé dans le REPL ou en test complet.**

## 4. Autres outils de debug utiles

| Outil | Quand l'utiliser |
|---|---|
| `await driver.getPageSource()` dans le REPL | Dump XML (natif) ou HTML (WebView) complet du contexte courant. Utile iOS natif quand `listInteractive()` retourne une liste vide (élément non `accessible`). |
| `chrome://inspect/#devices` dans Chrome | Inspecteur visuel de la WebView Android **pendant** une session `browser.debug()`. Ouvrir Chrome, aller sur `chrome://inspect`, cliquer "inspect" sous le process AMI. |
| **Appium Inspector** (app desktop) | Inspecter le contexte NATIVE iOS. Se connecter sur `localhost:4724` (session existante). Utile pour les overlays / sheets SwiftUI sans `accessibilityIdentifier`. |
| `logLevel: 'debug'` dans `wdio.base.conf.ts` | Voir chaque COMMAND / DATA / RESULT Appium dans la console. À ne pas commiter. |
| `just open-report` | Rapport Allure avec screenshots au moment de l'échec. À consulter avant toute session de debug. |

> **`wdio repl` (CLI standalone) est déconseillé pour AMI** : il faudrait re-déclarer toutes les capabilities Appium à la main, et l'app ne serait pas dans son état post-login. Préférer toujours `browser.debug()` à l'intérieur d'un test scratch.

## 5. Pièges spécifiques AMI

### iOS — flux FranceConnect

Ne jamais appeler `await driver.switchContext('NATIVE_APP')` (ni quitter manuellement le WebView) au milieu du flow OIDC. Cela provoque un freeze de ~25 s. Si tu es en train d'inspecter la mire FranceConnect, reste dans le `withWebView()`. Voir `guidelines/oidc-redirect-handling.md`.

### iOS — arbre d'accessibilité périmé

Symptôme : `listInteractive()` retourne une liste vide alors que la page est visuellement rendue dans la WebView. Cause : WKWebView en mode automation interroge un AX tree figé après un redirect.

Remède :

```js
> await refreshAxTree()   // force un re-scan du DOM côté iOS
> await listInteractive() // re-lister
```

Voir `guidelines/webview-quirks.md`.

### `browser.pause()` ≠ `browser.debug()`

`browser.pause(n)` dort pendant `n` ms. Le REPL n'est **pas** ouvert. Ne pas les confondre.

### Timeout Mocha

Sans `WDIO_DEBUG=1`, Mocha coupe le test après 2 min. Si tu oublies la variable d'env et que le test se fait tuer pendant que tu inspectes, relancer avec `WDIO_DEBUG=1`.

## 6. Où c'est implémenté dans le dépôt

| Fichier | Rôle |
|---|---|
| `src/helpers/inspect.ts` | `listInteractive()` — détecte le contexte et la plateforme, affiche le tableau |
| `wdio.base.conf.ts` (hook `before`) | Expose `listInteractive` et `withWebView` sur `globalThis` pour le REPL |
| `wdio.base.conf.ts` (`mochaOpts.timeout`) | `0` si `WDIO_DEBUG=1`, `120000` sinon |
| `src/scripts/inspect-webview.ts` | Script standalone `just inspect` (auto-détecte Android/iOS) — session séparée, sans login requis |

## 7. Sources

- [WebdriverIO — browser.debug()](https://webdriver.io/docs/api/browser/debug)
- [WebdriverIO — Debugging](https://webdriver.io/docs/debugging)
- [Chrome DevTools — Remote Debugging Android WebViews](https://developer.chrome.com/docs/devtools/remote-debugging/webviews/)
- [Appium Inspector](https://github.com/appium/appium-inspector)
