# Pièges iOS WKWebView / WebKit Remote Debugging Protocol

## 1. Symptôme

- `TimeoutError: executeAsync` échoue instantanément après le premier `switchContext` sur iOS — toutes les requêtes `findBy*` de Testing Library sont en timeout immédiat.
- Après un redirect OIDC, `waitForDisplayed()` retourne `false` alors que la page est visuellement rendue.
- Un clic sur un `<a>` ne déclenche pas la navigation SPA.
- `browser.waitUntil` sur `window.location.hash` se bloque pendant toute la navigation.

## 2. Pourquoi

WebKit Remote Debugging Protocol (WKRDP) est le canal de communication entre Appium et WKWebView. Il diffère de ChromeDriver/CDP sur plusieurs points critiques :

| Comportement | Chromedriver (Android) | WKRDP (iOS) |
|---|---|---|
| `scriptTimeout` après `switchContext` | conservé | **réinitialisé à ~0 ms** |
| AX tree après redirect OIDC | re-syncronisé automatiquement | **périmé jusqu'à trigger** |
| Clic sur `<a>` enfant | propagation normale | peut ne pas déclencher navigation |
| Scripts `executeAsync` pendant navigation | tolérés | **tués par WKWebView** |

### scriptTimeout réinitialisé

`@testing-library/webdriverio` utilise `executeAsync` (pas `execute`) pour ses requêtes `findBy*`. WKRDP réinitialise `scriptTimeout` à ~0 ms après chaque `switchContext`. Résultat : toutes les requêtes Testing Library expirent instantanément si ce reset n'est pas contrecarré.

### AX tree périmé après redirect OIDC

WKWebView en mode automation interroge un arbre d'accessibilité qui peut rester figé après un redirect de page. Un round-trip `driver.execute(() => 0)` ne suffit pas — il faut forcer la re-sérialisation du DOM.

## 3. Solution

### Reset `scriptTimeout` — automatique dans `withWebView()`

```typescript
// webview.ts — exécuté à chaque switchContext
if (driver.isIOS) {
  await browser.setTimeout({ script: 30000 }).catch(() => {})
}
```

C'est encapsulé dans `withWebView()` : ne rien faire de particulier, ne pas appeler `switchContext` directement.

### Refresh de l'AX tree — `refreshAxTree()`

```typescript
// Après un redirect OIDC côté iOS, avant toute interaction
await refreshAxTree() // no-op sur Android

const link = await tl().findByText(/faible/i, {}, { timeout: 8000 })
```

Implémentation : `driver.getPageSource()` force WKRDP à re-sérialiser le DOM et invalide le snapshot périmé.

```typescript
// webview.ts
export async function refreshAxTree(): Promise<void> {
  if (!driver.isIOS) return
  try { await driver.getPageSource() } catch { /* best-effort */ }
}
```

### Fallback JS hash quand le clic ne navigue pas

```typescript
await bell.click()
await browser.pause(500)
const hash = await driver.execute(() => window.location.hash) as string
if (!hash.includes('/notifications')) {
  // Fallback : forcer le hash directement
  await driver.execute(() => { window.location.hash = '/notifications' })
}
```

### `execute` synchrone plutôt qu'`executeAsync` pour les sentinelles SPA

WKWebView tue les scripts async en cours pendant une navigation. Pour tester si une page SPA est prête, utiliser `driver.execute` synchrone :

```typescript
// ✅ execute synchrone — survivant aux navigations
await browser.waitUntil(
  async () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
  { timeout: 10000 }
)

// ❌ executeAsync — tué pendant les navigations iOS
await browser.executeAsync((done) => {
  if (document.readyState === 'complete') done(true)
  else window.addEventListener('load', () => done(true))
})
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/helpers/webview.ts:54-58` — reset `scriptTimeout` dans `withWebView()`.
- `webdriverio/src/helpers/webview.ts:86-92` — implémentation `refreshAxTree()`.
- `webdriverio/src/pages/notifications.page.ts:24-28` — fallback JS hash.
- `webdriverio/src/pages/franceconnect.page.ts:15` — appel `refreshAxTree()` avant sélection eIDAS.
- `webdriverio/src/driver/capabilities.ts:63` — `webkitResponseTimeout: 3000`.

## 5. Sources

- Commits `94f1b7a` (scriptTimeout + submit iOS), `ffdb450` (refreshAxTree eIDAS), `8576992` (executeSync sentinelles SPA), `a4b9446` (fallback hash)
- [WebKit Bug : WKWebView AX tree stale after navigation](https://bugs.webkit.org/show_bug.cgi?id=232003) (comportement documenté)
- [Appium issue : scriptTimeout reset on iOS context switch](https://github.com/appium/appium/issues/17389)
