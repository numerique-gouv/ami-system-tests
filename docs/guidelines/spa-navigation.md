# Navigation dans une SPA hybride

Patterns pour naviguer de manière fiable dans l'app AMI (SPA Svelte dans une WebView native Android/iOS).

## 1. Symptôme

- `window.location.hash = '#/requests'` navigue mais contourne l'UX (liens invisibles, gardes de routes non déclenchées).
- Un clic sur un onglet semble réussi mais la liste affichée n'est pas mise à jour.
- `pullToRefresh()` à l'intérieur de `withWebView()` ne rafraîchit pas la liste.
- Un test vérifie `window.location.hash` pour confirmer la navigation alors que la page est déjà chargée.

## 2. Pourquoi

La WebView est embarquée dans un shell natif Android (`SwipeRefreshLayout`) et iOS. Certaines actions qui semblent web (navigation par hash, pull-to-refresh) sont en réalité traitées par la couche native ou nécessitent un geste dans le contexte `NATIVE_APP`.

Par ailleurs, vérifier le hash pour confirmer une navigation SPA est fragile : le hash peut être mis à jour avant que le contenu soit rendu, ou une route peut ne pas utiliser de hash du tout.

## 3. Solution

### Naviguer par clic sur éléments visibles, pas par manipulation JS

```typescript
// ✅ Simule l'utilisateur — déclenche les gardes de route, les analytics, l'UX complète
await withWebView(async () => {
  const link = await tl().getByRole('link', { name: /Suivi/i })
  await link.click()
})
// Puis confirmer par un élément visible de destination
await withWebView(async () => {
  await browser.waitUntil(
    async () => driver.execute(() =>
      !!document.querySelector('h1')?.textContent?.includes('Mes démarches')
    ) as Promise<boolean>,
    { timeout: 10000, interval: 300, timeoutMsg: 'Heading "Mes démarches" absent après navigation' }
  )
})

// ❌ Manipulation du hash — bot-like, peut contourner les gardes de route
await driver.execute(() => { window.location.hash = '#/requests' })
```

**Exception** : sur iOS, si le clic sur un `<a>` ne déclenche pas la navigation après 500 ms, utiliser le fallback JS hash documenté dans [webview-quirks.md §3](webview-quirks.md).

### Confirmer la navigation par un élément visible, pas par le hash

```typescript
// ✅ Element visible dans la page de destination — robuste aux changements de routing
await browser.waitUntil(
  async () => driver.execute(() =>
    !!document.querySelector('h1')?.innerText?.includes('Mes démarches')
  ) as Promise<boolean>,
  { timeout: 10000, timeoutMsg: 'Page Mes démarches non chargée' }
)

// ❌ Hash — peut être set avant que le contenu soit rendu
await browser.waitUntil(
  async () => (await driver.execute(() => window.location.hash)) === '#/requests',
  { timeout: 10000 }
)
```

**Exception — page sans heading identifiable :** si la page de destination est une pure liste
sans heading sémantique stable (ex. inbox notifications : 50+ `<a>`, aucun `h1`), la
confirmation par hash est légitime à condition que :
1. le hash ait été positionné juste avant (par clic ou fallback JS) dans le même `withWebView()` ;
2. une assertion sur le contenu réel (`waitForNotification`, `waitForItemWithStatus`…) suive
   immédiatement et confirme le rendu effectif.

```typescript
// ✅ Exception légitime — inbox notifications (pas de heading, 50+ <a>)
if (!hash.includes('/notifications')) {
  await driver.execute(() => { window.location.hash = '/notifications' })
}
await browser.waitUntil(
  async () => (await driver.execute(() => window.location.hash) as string).includes('/notifications'),
  { timeout: 15000, interval: 500, timeoutMsg: 'page /#/notifications non atteinte en 15s' }
)
// Le rendu réel est confirmé ensuite par waitForNotification(title)
```

### Pull-to-refresh : geste natif AVANT withWebView

L'app AMI Android utilise un `SwipeRefreshLayout` natif qui enveloppe la WebView. Le pull-to-refresh doit être un geste dans le contexte `NATIVE_APP`, avant d'entrer dans `withWebView`. `window.location.reload()` en JS ne déclenche pas le `SwipeRefreshLayout`.

```typescript
// ✅ Geste natif en dehors de withWebView
async pullToRefresh(): Promise<void> {
  const { width, height } = await driver.getWindowSize()
  await driver.action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.25) })
    .down({ button: 0 })
    .move({ duration: 800, x: Math.round(width / 2), y: Math.round(height * 0.65) })
    .up({ button: 0 })
    .perform()
}

// Dans la méthode PO qui attend une démarche :
async waitForDemarche(title: string): Promise<void> {
  await this.pullToRefresh()          // ← geste natif, hors WebView
  await withWebView(async () => {     // ← ensuite la vérification WebView
    await browser.waitUntil(
      async () => driver.execute((t: string) =>
        document.body.innerText.includes(t), title
      ) as Promise<boolean>,
      { timeout: 10000, interval: 1000, timeoutMsg: `"${title}" absent après pull-to-refresh` }
    )
  })
}

// ❌ pullToRefresh à l'intérieur de withWebView — le geste est intercepté par la WebView
await withWebView(async () => {
  await this.pullToRefresh() // ne déclenche pas SwipeRefreshLayout
})

// ❌ reload JS — ne déclenche pas SwipeRefreshLayout
await driver.execute(() => window.location.reload())
```

### Tab switching : driver.execute pour le clic, contenu pour la confirmation

Cliquer sur un onglet via Testing Library peut être instable si la SPA n'a pas encore rendu les onglets. Utiliser `driver.execute` pour le clic permet de cibler l'élément de manière synchrone.

```typescript
// ✅ Clic via driver.execute + confirmation par le contenu affiché
async switchTab(label: string): Promise<void> {
  await withWebView(async () => {
    await driver.execute((l: string) => {
      const tab = Array.from(document.querySelectorAll('button, [role="tab"]'))
        .find(el => el.textContent?.trim() === l) as HTMLElement | undefined
      tab?.click()
    }, label)
    // Confirmer que le contenu a changé (pas le hash, pas l'attribut aria-selected seul)
    await browser.waitUntil(
      async () => driver.execute((l: string) => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]'))
          .find(el => el.textContent?.trim() === l) as Element | undefined
        return tab?.getAttribute('aria-selected') === 'true'
      }, label) as Promise<boolean>,
      { timeout: 5000, interval: 300, timeoutMsg: `Onglet "${label}" non sélectionné` }
    )
  })
}
```

### Responsabilité PO : la navigation appartient à la page source

La méthode qui initie une navigation vers une autre page appartient à la **page qui effectue l'action**, pas à la page de destination.

```typescript
// ✅ HomePage initie la navigation vers la page Suivi
class HomePage {
  async ouvreSuivi(): Promise<void> { /* clic sur le lien "Suivi" */ }
}

// ❌ DemarchesPage expose une méthode pour se naviguer depuis la home — mauvaise séparation
class DemarchesPage {
  async openFromHome(): Promise<void> { /* navigation depuis la home — à déplacer */ }
}
```

Cela maintient la cohérence avec le pattern POM 3 niveaux décrit dans [cross-platform-page-objects.md](cross-platform-page-objects.md).

## 4. Où c'est appliqué dans le dépôt

- `src/pages/demarches.page.ts` — `pullToRefresh()`, `waitForDemarche()`, `switchTab()`, `assertItemAbsent()`.
- `src/pages/home.page.ts` — `ouvreSuivi()` (navigation vers la page Suivi initiée depuis Home).
- `src/tests/demarches.test.ts` — scénarios tab switching et pull-to-refresh.

## 5. Sources

- [WebdriverIO — Actions API](https://webdriver.io/docs/api/browser/action)
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [webview-quirks.md](webview-quirks.md) — fallback JS hash iOS, executeAsync tué pendant navigation
- [semantic-locators.md](semantic-locators.md) — innerText vs textContent, executeAsync vs driver.execute
