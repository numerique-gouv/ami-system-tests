# Qualité des assertions : des échecs informatifs

## 1. Symptôme

- Un test échoue avec `Expected: > 0, Received: 0` — impossible de savoir quelle était la valeur.
- Un `waitUntil` expire avec `Timeout exceeded` sans indiquer ce qu'il attendait.
- `await expect(string)` déclenche l'avertissement TypeScript `'await' has no effect`.
- Un test vérifie `expect(typeof x).toBe('boolean')` mais ne valide jamais la valeur.
- `waitForDisplayed()` suivi de `expect(await page.isVisible()).toBe(true)` — double attente inutile.

## 2. Pourquoi

La qualité d'une assertion se mesure au message produit en cas d'échec. Une assertion faible
oblige à relancer le test avec des logs supplémentaires pour comprendre ce qui s'est passé.
Une assertion forte expose directement la cause dans le rapport Allure.

Problèmes fréquents :

| Anti-pattern | Problème |
|---|---|
| `expect(x.length).toBeGreaterThan(0)` | La valeur réelle de `x` n'apparaît pas dans l'échec |
| `expect(typeof x).toBe('boolean')` | Ne valide que le type, pas le comportement |
| `await expect(primitive)` | `await` sans effet, confus pour le lecteur |
| `waitForDisplayed()` + `isDisplayed()` | Attend deux fois la même condition |
| `waitUntil(fn)` sans `timeoutMsg` | Timeout cryptique impossible à trier sans logs Appium |

## 3. Solution

### Assertions sur les textes et valeurs

```typescript
// ✅ La valeur est visible dans le message d'échec
expect(title).not.toBe('')
expect(version).toMatch(/\d+\.\d+/)    // "0.2.2 ne correspond pas à /\d+\.\d+/"
expect(newTop).toEqual(expectedTitle)  // "Received: 'foo', Expected: 'AMI-vanilla-123'"

// ❌ Seul le fait d'être non-vide est vérifié — valeur cachée
expect(title.length).toBeGreaterThan(0)
expect(name.length).toBeGreaterThan(0)
```

### Assertions sur les booléens : préférer des matchers spécifiques

```typescript
// ✅ Clair : on sait ce qui est attendu et la valeur réelle apparaît en cas d'échec
expect(await SettingsPage.isNotificationsToggleEnabled()).toBe(true)
expect(after).toBe(!before)

// ❌ Valide uniquement le type — ne teste aucun comportement
expect(typeof enabled).toBe('boolean')
```

Si "la valeur est récupérable" est vraiment le comportement à tester, documenter le pourquoi :

```typescript
// Une exception ici indique un bug driver — la valeur (true/false) importe peu
const _ = await SettingsPage.isNotificationsToggleEnabled()
```

### `await` devant `expect` : règle simple

```typescript
// ✅ await uniquement quand expect reçoit un élément WDIO (matcher retourne une Promise)
await expect($(loc.screenRoot)).toBeDisplayed()

// ✅ Pas d'await quand expect reçoit une valeur déjà résolue (string, boolean, number)
expect(title).not.toBe('')
expect(await PartnerPage.isVisible()).toBe(true)

// ❌ await sur une valeur primitive — TypeScript [80007], confusion
await expect(title.length).toBeGreaterThan(0)
await expect(typeof enabled).toBe('boolean')
```

### `waitUntil` : toujours passer `timeoutMsg`

```typescript
// ✅ Le message explique ce qui n'a pas changé
await browser.waitUntil(
  async () => (await SettingsPage.isNotificationsToggleEnabled()) !== before,
  { timeout: 3000, interval: 200, timeoutMsg: 'État du toggle non mis à jour en 3s' }
)

// ✅ Navigation OIDC
await browser.waitUntil(
  async () => (await driver.getUrl()) !== spaUrl,
  { timeout: 15000, interval: 300, timeoutMsg: 'Navigation depuis la SPA non détectée en 15s' }
)

// ❌ Sans message — le rapport Allure montre juste "Timeout exceeded"
await browser.waitUntil(async () => someCondition())
```

### Ne pas doubler `waitForDisplayed` et `isDisplayed`

`waitForDisplayed` (ou `waitForVisible`) garantit déjà que l'élément est affiché.
L'appel `isDisplayed` qui suit est redondant.

```typescript
// ✅ waitForVisible dans le before pour la navigation, assertion directe dans le test
await SettingsPage.waitForVisible()
// ...
expect(await SettingsPage.isVisible()).toBe(true)

// ❌ Double attente — waitForVisible + isDisplayed dans le même flux
await SettingsPage.waitForVisible()
await $(loc.screenRoot).waitForDisplayed() // déjà attendu ci-dessus
```

### Matchers WDIO sur éléments natifs

Pour les éléments natifs (hors WebView), les matchers `expect-webdriverio` appliquent
un auto-wait interne et affichent le sélecteur dans le message d'échec :

```typescript
// ✅ Auto-wait + message de l'échec contient le sélecteur
await expect($(loc.screenRoot)).toBeDisplayed()
await expect($(loc.versionLabel)).toHaveTextContaining(/\d+\.\d+/)

// ⚠️ Enrober dans le PO si la logique cross-platform l'impose — sinon utiliser directement
```

Dans la WebView SPA (contexte `WEBVIEW_*`), les éléments ne survivent pas au switch
de contexte — utiliser `driver.execute()` ou Testing Library dans `withWebView()`.

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/tests/settings.test.ts:36-39` — `waitUntil` avec `timeoutMsg`.
- `webdriverio/src/tests/notifications.test.ts:59` — `expect(newTop).toEqual(title)` (valeur visible).
- `webdriverio/src/helpers/webview.ts:52-57` — `waitUntil` avec `timeoutMsg` dans `waitForWebViewContext`.
- `webdriverio/src/pages/notifications.page.ts:29-34` — `waitUntil` avec `timeoutMsg` sur le hash.

Exemples de tests à améliorer pour exposer les valeurs :
- `webdriverio/src/tests/partner.test.ts:21,26` — `expect(name.length).toBeGreaterThan(0)` → `expect(name).not.toBe('')`.
- `webdriverio/src/tests/settings.test.ts:30` — `expect(typeof enabled).toBe('boolean')` → assertion comportementale.

## 5. Sources

- [WebdriverIO — Assertions](https://webdriver.io/docs/assertion/)
- [WebdriverIO — Best Practices](https://webdriver.io/docs/bestpractices/)
- [expect-webdriverio — Matchers](https://webdriver.io/docs/api/expect-webdriverio)
