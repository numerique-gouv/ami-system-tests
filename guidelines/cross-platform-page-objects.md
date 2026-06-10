# Architecture Page Objects cross-platform (iOS + Android)

## 1. Symptôme

- Un sélecteur qui fonctionne sur Android est codé en dur dans le test, le test plante sur iOS.
- La même logique d'interaction est dupliquée dans deux tests, un par plateforme.
- Un `if (driver.isIOS)` au milieu d'un test qui mélange la logique métier et les détails plateforme.

## 2. Pourquoi

L'application AMI est hybride : certains écrans sont natifs (bouton FC Android), d'autres sont dans la WebView SPA (bouton FC iOS, notifications). Les sélecteurs divergent par plateforme. Sans architecture claire, chaque test porte le poids de cette divergence.

## 3. Solution : POM 3 niveaux

```
src/tests/         ← scénarios Mocha, zéro sélecteur, zéro if(isIOS)
src/pages/         ← Page Objects, logique métier, dispatch via locators
src/pages/locators/ ← sélecteurs par plateforme + getXxxLocators()
```

### Niveau 1 — `locators/*.locators.ts`

Un fichier par page. Contient :
- Une interface TypeScript décrivant les locators de la page.
- Un objet `androidXxxLocators` et un objet `iosXxxLocators`.
- Une fonction `getXxxLocators()` qui dispatche selon `driver.isIOS`.

```typescript
// login.locators.ts
export interface LoginLocators {
  fcButton:         Locator
  fcButtonInWebView: boolean  // true → le Page Object doit switch en WebView
}

export const androidLoginLocators: LoginLocators = {
  fcButton:         '~franceConnect button', // accessibility id Android
  fcButtonInWebView: false,
}

export const iosLoginLocators: LoginLocators = {
  fcButton:         "button=S'identifier avec FranceConnect",
  fcButtonInWebView: true, // le bouton est dans la WebView SPA sur iOS
}

export function getLoginLocators(): LoginLocators {
  return driver.isIOS ? iosLoginLocators : androidLoginLocators
}
```

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur direct** — appel `getXxxLocators()` à chaque méthode.
- Le `if (driver.isIOS)` est autorisé quand le comportement d'interaction (pas le sélecteur) diffère vraiment.
- Les requêtes Testing Library sont inline, **pas** dans le fichier locators (elles sont pertinentes uniquement en WebView).
- Exporté comme singleton : `export default new XxxPage()`.

```typescript
// login.page.ts
class LoginPage {
  async tapFranceConnect(timeoutMs = 15000): Promise<void> {
    const loc = getLoginLocators()
    if (loc.fcButtonInWebView) {
      // iOS : bouton dans la SPA WebView
      await withWebView(async () => {
        await $(loc.fcButton).waitForDisplayed({ timeout: timeoutMs })
        await $(loc.fcButton).click()
      })
    } else {
      // Android : bouton natif
      await $(loc.fcButton).waitForDisplayed({ timeout: timeoutMs })
      await $(loc.fcButton).click()
    }
  }
}
export default new LoginPage()
```

### Niveau 3 — `tests/*.test.ts`

Appelle uniquement des méthodes Page Object. Le test lit comme un scénario métier.

```typescript
it("reçoit une notification", async () => {
  await LoginPage.tapFranceConnect()
  await FranceConnectPage.loginWithSandbox()
  await NotificationsInboxPage.waitForNotification(title)
})
```

### Convention cross-équipe pour les éléments communs

Poser le même identifiant sur iOS et Android :
- iOS : `accessibilityIdentifier` en SwiftUI
- Android : `contentDescription` en Compose / XML

Un seul locator `accessibility id` suffit alors des deux côtés : `~monElementId`.

### Branchement `if (driver.isIOS)` acceptable

Le branchement explicite est acceptable dans le Page Object quand le comportement d'interaction diffère vraiment (pas juste le sélecteur) :

| Cas | iOS | Android |
|---|---|---|
| Submit formulaire FCP-LOW | `driver.execute(() => btn.click())` | `browser.keys(['Return'])` |
| Clic JS vs pointer events | fallback JS hash | pointer events Chromedriver natifs |
| Wait post-OIDC | `waitUntil(url !== spaUrl)` | pas nécessaire (bouton déjà en WebView) |

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/pages/locators/login.locators.ts` — exemple complet d'interface + dispatch `getLoginLocators()`.
- `webdriverio/src/pages/login.page.ts:27-39` — Page Object sans sélecteur direct.
- `webdriverio/src/pages/locators/notifications.locators.ts` — cas où **tout** est en WebView : le fichier locators est vide de sélecteurs natifs, les queries TL sont inline dans le Page Object.

## 5. Sources

- Plan `.claude/plan-i-want-a-webdriver-shiny-rossum.md` — architecture initiale POM 3 niveaux
- Commit `301c6a6` — migration des locators natifs et requêtes TL inline
