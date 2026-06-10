# Gérer les redirects OIDC / FranceConnect

## 1. Symptôme

- `waitForDisplayed` timeout sur la page post-login alors que l'app est revenue sur la home.
- `Element is not clickable` sur le bouton eIDAS juste après l'ouverture de la page FC.
- Le bouton "S'identifier avec FranceConnect" réapparaît brièvement en plein milieu du test et provoque un `click()` inattendu.
- `TimeoutError: Navigation depuis la SPA non détectée` — le test attend une URL qui a déjà changé.

## 2. Pourquoi

Le flow OIDC FranceConnect implique plusieurs redirects cross-origin successifs :

```
SPA AMI → serveur FC (eIDAS) → fip1-low (credentials) → callback AMI → SPA AMI
```

Chaque redirect change l'URL et peut invalider l'état WebView en cours d'inspection. Sur iOS, l'AX tree WKWebView reste figé pendant ces transitions (voir [ios-wkwebview-quirks.md](ios-wkwebview-quirks.md)).

Sur Android, le bouton FC est natif. Quand la session OIDC se termine, l'app revient sur la home mais la WebView peut encore "rejouer" brièvement l'état précédent — le bouton FC peut réapparaître une fraction de seconde.

## 3. Solution

### Attendre la navigation avant d'interagir

Ne jamais supposer qu'une page est chargée après un redirect. Attendre systématiquement :

```typescript
// Sur iOS : attendre que l'URL quitte la SPA avant de chercher la page eIDAS
if (driver.isIOS) {
  const spaUrl = await driver.getUrl().catch(() => '')
  await browser.waitUntil(
    async () => (await driver.getUrl().catch(() => spaUrl)) !== spaUrl,
    { timeout: 15000, interval: 300 }
  ).catch(() => {})
}
```

### `refreshAxTree()` sur iOS avant toute interaction post-redirect

```typescript
// Après un redirect OIDC côté iOS (dans withWebView())
await refreshAxTree()
const eidasLink = await tl().findByText(/faible/i, {}, { timeout: 8000 }).catch(() => null)
```

### Reset `scriptTimeout` implicite dans `withWebView()`

Après un re-switch en WebView post-redirect, `withWebView()` remet automatiquement `scriptTimeout` à 30 s. Ne pas appeler `switchContext` directement.

### Retry court pour le bouton FC qui réapparaît

Le bouton FC peut brièvement réapparaître à la fin du redirect OIDC (notamment iOS). L'attraper avec un `try/catch` court :

```typescript
// Dans le test, après loginWithSandbox()
try {
  await LoginPage.tapFranceConnect(5000) // timeout court = best-effort
} catch {
  // Absent dans la majorité des cas — normal
}
```

Le Page Object `tapFranceConnect(timeoutMs)` accepte un timeout pour ce cas d'usage.

### Ne pas sortir de `withWebView()` pendant le flow OIDC

Un seul `withWebView()` doit couvrir l'ensemble du flow FC (eIDAS → credentials → submit). Sur iOS, sortir du contexte WEBVIEW après une navigation cross-origin rend le contexte WKRDP non-ré-inspectable pendant ~25 s.

```typescript
// ✅ Un seul withWebView pour tout le flow
await withWebView(async () => {
  await selectEidasFaible()    // redirect 1
  await refreshAxTree()
  await fillCredentials(...)   // redirect 2
  await submit()               // redirect 3 → retour SPA
})

// ❌ Plusieurs withWebView imbriqués — le second attendrait 25s sur iOS
await withWebView(async () => { await selectEidasFaible() })
await withWebView(async () => { await fillCredentials() }) // bloquant sur iOS
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/pages/franceconnect.page.ts:100-126` — `loginWithSandbox()` avec attente URL et retry `refreshAxTree`.
- `webdriverio/src/pages/franceconnect.page.ts:13-23` — `selectEidasFaible()` avec `refreshAxTree()`.
- `webdriverio/src/tests/notifications.test.ts:31-35` — retry court bouton FC post-OIDC.
- `webdriverio/src/pages/login.page.ts:27` — `tapFranceConnect(timeoutMs)` paramétrable.

## 5. Sources

- Commits `ffdb450` (refreshAxTree eIDAS faible), `9636a98` (retry FC button iOS), `2473cc1` (timeout paramétrable)
- [FranceConnect — Documentation flux OIDC](https://partenaires.franceconnect.gouv.fr/fcp/fournisseur-service)
- [ios-wkwebview-quirks.md](ios-wkwebview-quirks.md) — détail sur l'AX tree périmé
