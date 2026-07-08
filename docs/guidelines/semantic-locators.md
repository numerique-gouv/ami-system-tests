# Sélecteurs sémantiques : préférer Testing Library aux sélecteurs structurels

## 1. Symptôme

- Un test se met à échouer après un refactoring CSS ou DSFR sans que la fonctionnalité ait changé.
- Un sélecteur `[id^="idp-"]` cible le mauvais élément quand un nouveau fournisseur est ajouté à la page.
- Un `normalize-space()` XPath casse à cause d'une apostrophe typographique (U+2019) vs ASCII.
- Un sélecteur `nth-child(2)` casse quand l'ordre des éléments change.

## 2. Pourquoi

Les sélecteurs structurels (CSS par id préfixe, XPath par position, index DOM) couplent le test à l'implémentation interne du composant plutôt qu'à son contrat visible. Un composant DSFR mis à jour, un refactoring de l'arbre DOM, ou un changement de texte localisé suffisent à faire échouer le test sans régression fonctionnelle.

Les sélecteurs sémantiques (rôle ARIA, texte visible, label d'accessibilité) ciblent ce que l'utilisateur voit et perçoit — ils sont stables face aux changements d'implémentation.

## 3. Solution

### Dans la WebView SPA : Testing Library

Utiliser `@testing-library/webdriverio` via le helper `tl()` à l'intérieur d'un bloc `withWebView()` :

```typescript
// ✅ Sélecteur sémantique — stable même si le href ou la classe change
const bell = await tl().getByRole('link', { name: /notifications/i })

// ✅ Texte visible — robuste face aux changements DOM
const item = await tl().findByText(title)

// ✅ Regex insensible à la casse — tolère capitalisation et mise en forme
const link = await tl().findByText(/faible/i, {}, { timeout: 8000 })

// ❌ Sélecteur positionnel — casse si l'ordre des éléments change
const idp = $('[id^="idp-"]:nth-child(2)')

// ❌ XPath avec normalisation de texte — fragile sur les apostrophes typographiques
const btn = $('//button[normalize-space()="S\'identifier avec FranceConnect"]')
```

**Attention** : les queries Testing Library utilisent `executeAsync` → elles ne fonctionnent **qu'à l'intérieur de `withWebView()`** (voir [webview-context-switching.md](webview-context-switching.md)).

### Dans les écrans natifs : `accessibility id`

Préférer l'`accessibility id` (iOS `accessibilityIdentifier` / Android `contentDescription`) au sélecteur XPath par texte ou resource-id :

```typescript
// ✅ accessibility id — même sélecteur iOS et Android si la convention est respectée
'~profileAvatar'

// ✅ Android resource-id — stable
'android=new UiSelector().resourceId("fr.gouv.ami.staging:id/fcButton")'

// ❌ XPath par texte natif — dépend de la locale et de la mise en forme
'//*[@text="S\'identifier avec FranceConnect"]'
```

### Séparation locators natifs / queries Testing Library

| Type | Où le mettre |
|---|---|
| Sélecteurs natifs (resource-id, accessibility id, predicate) | `pages/locators/*.locators.ts` |
| Queries Testing Library (`getByRole`, `findByText`) | Inline dans le Page Object |

Testing Library n'est pertinent qu'en WebView — mettre ces queries dans un fichier locators n'apporterait aucune réutilisation et rendrait la séparation confuse.

### Limites des queries Testing Library : executeAsync vs driver.execute

Les queries `tl()` (`getBy*`, `findBy*`, `queryBy*`) reposent sur `executeAsync`. Pendant une navigation SPA active, ce script est **tué par le driver** — sur iOS (WKRDP) et sur Android (Chromedriver). Résultat : timeout systématique à 60 s quand on appelle `tl().findByRole(...)` dans un `waitUntil` post-navigation.

**Règle** :
- **Interactions utilisateur** (clic, remplissage) une fois la page stable → `tl()` convient.
- **Sentinelles de navigation / readiness** → `driver.execute` (JS synchrone) dans un `browser.waitUntil`.

```typescript
// ✅ Détecter si la page d'accueil est prête après OIDC
await browser.waitUntil(
  async () => driver.execute(() =>
    Array.from(document.querySelectorAll('a')).some(a => a.textContent?.trim() === 'Suivi')
  ) as Promise<boolean>,
  { timeout: 15000, interval: 500, timeoutMsg: 'Lien "Suivi" absent après OIDC' }
)

// ❌ tl().findByRole dans un waitUntil — executeAsync tué pendant la navigation
await browser.waitUntil(
  async () => { await tl().findByRole('link', { name: /Suivi/i }); return true },
  { timeout: 15000 }
)
```

Voir aussi [webview-quirks.md §3](webview-quirks.md) pour les détails cross-platform.

### Stratégie en une passe : `$$()` + `.getText()` plutôt que `driver.execute` + `textContent`/`innerText`

Quand un scénario doit vérifier plusieurs informations sur un même élément (titre + statut, titre + URL), fusionner les vérifications en une seule boucle `waitUntil` sur `$$()` plutôt que d'écrire un callback `driver.execute` qui rejoue `textContent`/`innerText` à la main :

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

// ❌ driver.execute + textContent/innerText réimplémente ce que $$().getText() fait déjà,
//    et re-parcourt le DOM une fois par critère (titre, puis statut, puis URL séparément)
driver.execute((contentSel, titleSel, badgeSel, t) => {
  const cards = Array.from(document.querySelectorAll(contentSel))
  const card = cards.find(c => c.querySelector(titleSel)?.textContent?.includes(t))
  return (card?.querySelector(badgeSel) as HTMLElement | null)?.innerText?.trim() ?? ''
}, loc.cardContent, loc.cardTitle, loc.cardBadge, title)
```

`$$()` reste soumis aux mêmes limites `executeAsync` que `tl()` (voir §"Limites des queries Testing Library" ci-dessus) : à utiliser une fois la navigation stabilisée, pas comme sentinelle de navigation elle-même.

Les classes DSFR (`fr-badge`, `fr-tile__content`, `fr-tile__title`, etc.) font partie du contrat du Design Système de l'État — elles sont aussi stables que les rôles ARIA, et plus stables que les classes Svelte hashées (ex. `svelte-19k7n5y`) qui changent à chaque build.

```typescript
// ❌ Explorer via classes Svelte hashées — fragile, change à chaque build
card.$('.svelte-19k7n5y').getText()
```

**Règle pratique** : préférer les méthodes WDIO (`$$()`, `.getText()`, `.getAttribute()`) à un callback `driver.execute` manuel dès que la logique est exprimable avec l'API WDIO standard — `driver.execute` reste réservé aux cas où `$()`/`$$()` échoue réellement (navigation en cours, bug WKRDP documenté, cf. [webview-quirks.md](webview-quirks.md)).

### innerText vs textContent vs offsetParent

Quand `tl().findByText('TERMINÉ')` échoue alors que le texte est visible, le problème vient souvent du CSS (`text-transform: uppercase`). Testing Library utilise `textContent` (texte brut DOM) qui ne respecte pas le CSS.

| Propriété | Ce qu'elle voit | Cas d'usage |
|---|---|---|
| `textContent` | Texte brut DOM, ignore CSS | **Identifier** un élément parmi d'autres (clé de recherche) ; Testing Library ; valeur stockée indépendamment du rendu |
| `innerText` | Texte rendu (respecte `display:none`, `visibility:hidden`, `text-transform`) | **Asserter** qu'un état est visible à l'écran ; sentinelles de navigation ; vérification badge/statut |
| `offsetParent === null` | Élément retiré du layout (`display:none`) | Ne détecte **pas** `visibility:hidden` |

```typescript
// ✅ Vérifier la présence d'un texte affiché, insensible à text-transform
await browser.waitUntil(
  async () => driver.execute((t: string) =>
    document.body.innerText.toLowerCase().includes(t.toLowerCase()), title
  ) as Promise<boolean>,
  { timeout: 5000, interval: 500, timeoutMsg: `"${title}" absent du rendu` }
)

// ❌ textContent — rate si text-transform: uppercase transforme "TERMINÉ" en "Terminé" dans le DOM
driver.execute(() => document.body.textContent?.includes('TERMINÉ'))
```

### Confirmation d'état : texte visible > attributs DOM invisibles

Pour confirmer qu'une action a eu l'effet attendu (navigation, changement d'onglet, mise à jour de liste), préférer les **textes visibles** aux attributs structurels invisibles pour l'utilisateur.

| Critère | Visibilité | Recommandation |
|---|---|---|
| `innerText` / texte rendu | ✅ Visible utilisateur | **Préférer** pour confirmer un changement de contenu |
| `aria-selected="true"` | ⚠️ Sémantique ARIA | Acceptable pour l'état d'un composant ARIA (onglets, boutons radio) quand le contenu seul est insuffisant |
| `.active`, `.selected`, `.is-current` (classes CSS) | ❌ Détail d'implémentation | **Proscrire** — couplage fort à la bibliothèque de composants |
| `offsetParent`, `display`, `visibility` (propriétés de layout) | ❌ Détail d'implémentation | **Proscrire** — fragile face aux refactorings CSS |

```typescript
// ✅ Confirmer qu'un onglet est actif par son texte visible dans le rendu
await browser.waitUntil(
  async () => driver.execute(() =>
    document.body.innerText.includes('Résultats pour Passées')
  ) as Promise<boolean>,
  { timeout: 5000, timeoutMsg: 'Contenu "Passées" non affiché après le clic' }
)

// ✅ Acceptable : aria-selected est le contrat sémantique des composants [role="tab"]
//    à utiliser quand le contenu de l'onglet peut être vide
await browser.waitUntil(
  async () => driver.execute((label: string) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(el => el.textContent?.trim() === label)
    return btn?.getAttribute('aria-selected') === 'true'
  }, 'Passées') as Promise<boolean>,
  { timeout: 5000, timeoutMsg: 'Onglet "Passées" non sélectionné' }
)

// ❌ Classes CSS — détail d'implémentation DSFR, change sans régression fonctionnelle
btn?.classList.contains('fr-tabs__tab--selected')

// ❌ Classes génériques — couplage à la convention de nommage du framework
btn?.classList.contains('active') || btn?.classList.contains('selected')
```

**Règle pratique** : si un QA humain peut confirmer l'état en lisant l'écran, utiliser `innerText`. Si l'état n'est pas directement lisible mais est décrit par un attribut ARIA sémantique (`aria-selected`, `aria-expanded`, `aria-checked`), ce dernier est acceptable. Ne jamais utiliser de classes CSS.

### Exclusion de labels de navigation

Quand on cherche un titre métier parmi plusieurs éléments ARIA, exclure explicitement les labels de navigation pour éviter les faux positifs :

```typescript
const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
const el = Array.from(document.querySelectorAll<Element>('[aria-label]'))
  .find((e) => !EXCLUDED.has(e.getAttribute('aria-label') ?? ''))
```

### Sélecteurs CSS WebView dans les fichiers locators

Les sélecteurs CSS utilisés dans les callbacks `driver.execute` doivent être centralisés dans `pages/locators/*.locators.ts`, au même titre que les sélecteurs natifs. Cela permet de choisir des sélecteurs différents selon la plateforme si l'app venait à exposer des structures DOM distinctes sur iOS et Android, et de ne pas dupliquer les chaînes CSS dans les Page Objects.

Les callbacks `driver.execute` s'exécutent dans le contexte browser — les constantes TypeScript ne sont pas accessibles directement. Les passer **en arguments** :

```typescript
// demarches.locators.ts — un seul objet, WebView commune iOS/Android (cf. cross-platform-page-objects.md)
export const demarchesLocators = { cardContent: '.fr-tile__content', cardTitle: '.fr-tile__title' }

// demarches.page.ts — $$() consomme directement les locators centralisés, pas de driver.execute
const loc = getDemarchesLocators()
for await (const card of $$(loc.cardContent)) {
  const titleText = await card.$(loc.cardTitle).getText().catch(() => '')
  if (titleText.includes(title)) { /* ... */ }
}
```

## 4. Où c'est appliqué dans le dépôt

- `src/helpers/webview.ts` — helper `tl()` qui expose Testing Library.
- `src/pages/notifications.page.ts` — `getByRole('link')` pour la cloche, exclusion des labels de navigation.
- `src/pages/locators/notifications.locators.ts` — fichier volontairement vide de sélecteurs (tout est en WebView, queries TL dans le Page Object).
- `src/pages/locators/demarches.locators.ts` — CSS selectors WebView centralisés, objet unique sans dispatch plateforme.
- `src/pages/demarches.page.ts` — `assertVisibleDemarcheWith`, `$$()` + `.getText()` avec locators centralisés.

## 5. Sources

- Plan `.claude/plan-as-you-can-see-cheerful-ritchie.md` — migration depuis `[id^="idp-"]` vers sélecteurs sémantiques
- Commit `064d784` — introduction de `@testing-library/webdriverio`
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [WAI-ARIA roles](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles)
