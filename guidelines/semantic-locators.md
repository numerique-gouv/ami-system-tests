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

### Exclusion de labels de navigation

Quand on cherche un titre métier parmi plusieurs éléments ARIA, exclure explicitement les labels de navigation pour éviter les faux positifs :

```typescript
const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
const el = Array.from(document.querySelectorAll<Element>('[aria-label]'))
  .find((e) => !EXCLUDED.has(e.getAttribute('aria-label') ?? ''))
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/helpers/webview.ts:14-18` — helper `tl()` qui expose Testing Library.
- `webdriverio/src/pages/notifications.page.ts:16` — `getByRole('link')` pour la cloche.
- `webdriverio/src/pages/notifications.page.ts:48-53` — exclusion des labels de navigation.
- `webdriverio/src/pages/locators/notifications.locators.ts` — fichier volontairement vide de sélecteurs (tout est en WebView, queries TL dans le Page Object).

## 5. Sources

- Plan `.claude/plan-as-you-can-see-cheerful-ritchie.md` — migration depuis `[id^="idp-"]` vers sélecteurs sémantiques
- Commit `064d784` — introduction de `@testing-library/webdriverio`
- [Testing Library — Guiding Principles](https://testing-library.com/docs/guiding-principles)
- [WAI-ARIA roles](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles)
