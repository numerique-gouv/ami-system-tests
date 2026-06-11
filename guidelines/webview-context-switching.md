# Bascule de contexte WebView : toujours passer par `withWebView()`

## 1. Symptôme

- `WebDriverError: no such element` sur un sélecteur CSS alors que l'élément est visible.
- `no such window: window was already closed` après un flow OIDC.
- `Element is not interactable` sur un `swipe` ou `keys('Return')` dans une WebView.
- Le contexte reste bloqué en `WEBVIEW_*` après une exception, ce qui casse le test suivant.

## 2. Pourquoi

Appium expose deux contextes pour les apps hybrides :

| Contexte | Accès |
|---|---|
| `NATIVE_APP` | Éléments natifs (UIAutomator2 / XCUITest) |
| `WEBVIEW_*` | DOM web (sélecteurs CSS/XPath, Testing Library) |

Les sélecteurs CSS et XPath ne fonctionnent **qu'en `WEBVIEW_*`**.
Les gestes (swipe, pull-to-refresh, `keys`) et les sélecteurs natifs ne fonctionnent **qu'en `NATIVE_APP`**.

Pendant un flow OIDC, le tab WebView callback se ferme juste après le redirect. Sans re-sélection du dernier `windowHandle`, Chromedriver pointe sur un handle stale et lève `no such window`.

## 3. Solution

Encapsuler **toute** interaction WebView dans `withWebView()`. Ce helper :

1. Attend qu'un contexte `WEBVIEW_*` soit disponible (poll 500 ms, max 25 s).
2. Switch vers ce contexte.
3. Réinitialise `scriptTimeout` à 30 s sur iOS (voir [webview-quirks.md](webview-quirks.md)).
4. Re-sélectionne le dernier `windowHandle` (gère la fermeture du tab OIDC).
5. Exécute le callback.
6. **Restaure `NATIVE_APP` dans le bloc `finally`**, même si le callback lance.

```typescript
// ✅ Correct — le contexte est restauré quoi qu'il arrive
await withWebView(async () => {
  const bell = await tl().getByRole('link', { name: /notifications/i })
  await bell.click()
})
// Ici le driver est de retour en NATIVE_APP

// ❌ À proscrire — si une exception est levée, le driver reste en WEBVIEW
await driver.switchContext('WEBVIEW_com.example')
const bell = await tl().getByRole('link', { name: /notifications/i })
await bell.click()
await driver.switchContext('NATIVE_APP') // jamais atteint si click() échoue
```

### Règles complémentaires

- **Gestes en `NATIVE_APP`** : swipe, pull-to-refresh natif, `keys('Return')` — ne jamais les appeler depuis l'intérieur de `withWebView()`.
- **Reload WebView** : préférer `driver.execute(() => { window.location.reload() })` au swipe pull-to-refresh natif (plus fiable, garantit un fetch serveur).
- **WebView "endormie"** : si `waitForDisplayed` timeout juste après une navigation, un léger swipe natif (`NATIVE_APP`) avant d'entrer dans `withWebView()` réveille le moteur de rendu.

```typescript
// Réveil de la WebView après navigation
await driver.action('pointer').move({ x: 200, y: 600 }).down().move({ y: 400 }).up().perform()
await withWebView(async () => {
  // ...
})
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/helpers/webview.ts:44` — implémentation de `withWebView()`, logique window handles et restauration `NATIVE_APP`.
- `webdriverio/src/pages/notifications.page.ts:67` — `pullToRefresh()` via `location.reload()` plutôt que swipe.
- `webdriverio/src/pages/notifications.page.ts:12` — ouverture de l'inbox avec fallback JS hash.

## 5. Sources

- Commits `e54589f` (window handles stale post-OIDC), `94f1b7a` (scriptTimeout iOS), `301c6a6` (réveil WebView)
- [Appium — Automating Hybrid Apps](https://appium.io/docs/en/latest/guides/hybrid/)
