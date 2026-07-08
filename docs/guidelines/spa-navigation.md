# Navigation dans une SPA hybride

Patterns pour naviguer de manière fiable dans l'app AMI (SPA Svelte dans une WebView native Android/iOS).

## 1. Symptôme

- `window.location.hash = '#/requests'` navigue mais contourne l'UX (liens invisibles, gardes de routes non déclenchées).
- Un clic sur un onglet semble réussi mais la liste affichée n'est pas mise à jour.
- `pullToRefresh()` à l'intérieur de `withWebView()` ne rafraîchit pas la liste.
- Un test vérifie `window.location.hash` pour confirmer la navigation alors que la page est déjà chargée.
- Après une navigation, `listInteractiveAll()` ou `tl().findBy*` ne trouvent plus rien — même après `refreshAxTree()`.
- Un clic JS via `driver.execute(el?.click())` n'ouvre pas un menu ou ne déclenche pas une navigation sur iOS.

## 2. Pourquoi

La WebView est embarquée dans un shell natif Android (`SwipeRefreshLayout`) et iOS. Certaines actions qui semblent web (navigation par hash, pull-to-refresh) sont en réalité traitées par la couche native ou nécessitent un geste dans le contexte `NATIVE_APP`.

Par ailleurs, vérifier le hash pour confirmer une navigation SPA est fragile : le hash peut être mis à jour avant que le contenu soit rendu, ou une route peut ne pas utiliser de hash du tout.

## 3. Solution

### Navigation + sentinel dans le même `withWebView()`

Sortir du contexte WebView (`switchContext('NATIVE_APP')`) pendant qu'une transition SPA est en cours laisse WKWebView dans un état instable sur iOS : l'AX tree devient corrompu et `refreshAxTree()` ne suffit pas à le récupérer. Les outils WDIO (`tl().findBy*`, `listInteractiveAll`) ne trouvent plus rien sur la page suivante.

**Règle** : navigation et confirmation du DOM de destination doivent être dans le **même** `withWebView()`.

```typescript
// ✅ Navigation + sentinel dans un seul withWebView — DOM stable avant de quitter le contexte
await withWebView(async () => {
  await driver.execute(() => { window.location.hash = '/notifications' })
  // Rester ici jusqu'à ce que la destination soit stable
  await browser.waitUntil(
    async () => driver.execute(() =>
      Array.from(document.querySelectorAll('a'))
        .some(a => (a as HTMLElement).innerText?.trim() === 'Suivi')
    ) as Promise<boolean>,
    { timeout: 10000, interval: 500, timeoutMsg: 'Home non atteinte' }
  )
})

// ❌ Navigation dans un withWebView(), sentinel dans un second — WKWebView instable entre les deux
await withWebView(async () => {
  await driver.execute(() => { window.location.hash = '/notifications' })
})
// ← sortie de contexte pendant la transition SPA → AX tree corrompu sur iOS
await withWebView(async () => {
  await tl().findByRole('link', { name: /Suivi/i }) // échoue même après refreshAxTree()
})
```

Ce pattern s'applique aussi à la navigation par clic : rester dans `withWebView()` le temps que le contenu de destination soit confirmé.

---

### Préférer les clics utilisateur aux injections JS sur iOS

Sur iOS/WKWebView, `document.querySelector(sel)?.click()` via `driver.execute` ne propage pas l'intégralité de la séquence d'événements (`pointerdown → mousedown → click`). Les handlers Svelte attachés via `on:click` / `addEventListener` peuvent ne pas être déclenchés, en particulier pour les boutons qui ouvrent des menus ou déclenchent une navigation.

**Règle** : pour toute interaction qui doit déclencher un comportement Svelte (ouverture de menu, soumission, navigation), utiliser `$(sel).click()` WDIO, précédé de `waitForClickable()`. Réserver `driver.execute(?.click())` aux sentinelles de navigation (vérifier la présence d'un élément, pas interagir avec).

```typescript
// ✅ Vrai clic WDIO — XCUITest génère les événements complets, fonctionne iOS + Android
await $(loc.toggleMenuButton).waitForClickable({ timeout: 5000 })
await $(loc.toggleMenuButton).click()

// ✅ Encore mieux : sélecteur sémantique via Testing Library (texte visible utilisateur)
const btn = await tl().findByRole('button', { name: 'Me déconnecter' })
await btn.click()

// ❌ JS click via driver.execute — silencieux sur iOS si Svelte n'attrape pas l'événement
await driver.execute((sel: string) => {
  document.querySelector<HTMLElement>(sel)?.click()
}, loc.toggleMenuButton)
```

**Préférence pour les sélecteurs** :
1. `tl().findByRole / findByLabelText / findByText` — cible ce que l'utilisateur voit, résistant aux refactorings DOM
2. `$(loc.selector).click()` avec `data-testid` — quand le texte est ambigu (ex. 3 boutons "Modifier")
3. `driver.execute(?.click())` — uniquement pour les sentinelles (vérification de présence), jamais pour des interactions

---

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

**Ne pas supposer qu'une page manque de heading sans avoir vérifié le DOM rendu.** L'inbox
notifications a longtemps été traitée comme une "page sans heading identifiable" (exception
hash ci-dessous) — c'est faux : elle a un heading `"Notifications"`, simplement noyé parmi 50+
`<a>` de la liste. `NotificationsInboxPage.openFromHome()` confirme désormais la navigation par
ce heading, comme le reste du fichier :

```typescript
// ✅ src/pages/notifications.page.ts — heading "Notifications" présent, malgré la liste de <a>
await browser.waitUntil(
  async () => driver.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"]'))
      .some(h => h.innerText?.trim() === 'Notifications')
  ) as Promise<boolean>,
  { timeout: 15000, interval: 500, timeoutMsg: 'Heading "Notifications" absent après navigation' }
)
```

**Exception résiduelle — page réellement sans heading stable :** si un futur écran s'avère,
après inspection du DOM rendu (`just inspect`, pas une supposition), dépourvu de tout heading
sémantique, la confirmation par hash reste un dernier recours à condition que :
1. le hash ait été positionné juste avant (par clic ou fallback JS) dans le même `withWebView()` ;
2. une assertion sur le contenu réel suive immédiatement et confirme le rendu effectif.

Vérifier d'abord qu'il n'existe vraiment aucun heading (y compris hors-écran ou stylé) avant de
retomber sur cette exception — cf. `docs/guidelines/semantic-locators.md` §"innerText vs textContent"
sur les faux négatifs liés au CSS.

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

- `src/pages/home.page.ts` — `waitForDemarche()`.
- `src/pages/demarches.page.ts` — `assertVisibleDemarcheWith()`, `goToHome()`.
- `src/pages/home.page.ts` — `ouvreSuivi()` (navigation vers la page Suivi initiée depuis Home).
- `src/pages/notifications.page.ts` — `openFromHome()` : confirmation par heading `"Notifications"`, pas par hash.
- `src/tests/demarches.test.ts` — scénarios tab switching et pull-to-refresh.

## 5. Sources

- [WebdriverIO — Actions API](https://webdriver.io/docs/api/browser/action)
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [webview-quirks.md](webview-quirks.md) — fallback JS hash iOS, executeAsync tué pendant navigation
- [semantic-locators.md](semantic-locators.md) — innerText vs textContent, executeAsync vs driver.execute
