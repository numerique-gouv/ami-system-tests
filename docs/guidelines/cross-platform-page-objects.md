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

**Exception : locators strictement identiques sur les deux plateformes.** Quand une page est entièrement dans la WebView SPA et que le DOM est le même sur iOS et Android (pas de sélecteur natif divergent), maintenir deux objets identiques n'apporte rien — exporter un seul objet partagé et le retourner inconditionnellement :

```typescript
// demarches.locators.ts — WebView commune, aucun dispatch nécessaire
export const demarchesLocators: DemarchesLocators = {
  cardContent: '.fr-tile__content',
  cardTitle:   '.fr-tile__title',
  cardBadge:   '.fr-badge',
  cardLink:    'a[data-testid="followup-item-link"]',
}

// getXxxLocators() reste la seule API appelée par le Page Object — même si elle
// ne dispatch plus rien, elle garde la possibilité de redevenir plateforme-spécifique
// sans toucher aux appelants.
export function getDemarchesLocators(): DemarchesLocators {
  return demarchesLocators
}
```

Ne pas fusionner par anticipation : si un seul champ diverge un jour entre iOS et Android, repasser au dual-object plutôt que d'ajouter un `driver.isIOS ? ... : ...` ponctuel dans l'objet partagé.

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur direct** — appel `getXxxLocators()` à chaque méthode.
- Le `if (driver.isIOS)` est autorisé quand le comportement d'interaction (pas le sélecteur) diffère vraiment.
- Les requêtes Testing Library sont inline, **pas** dans le fichier locators (elles sont pertinentes uniquement en WebView).
- Exporté comme singleton tracé : `export default traced(new XxxPage(), 'XxxPage')` (voir le logger `page-object` dans `wdio.base.conf.ts`).

```typescript
// login.page.ts
class LoginPage {
  async tapFranceConnect(oidcConcurrencyBugOnIOs = false): Promise<void> {
    const loc = getLoginLocators()
    const timeout = oidcConcurrencyBugOnIOs ? 5000 : 15000
    // catch loggé sauf cas attendu (retry best-effort) — voir retry-strategies.md §Niveau 3
    if (loc.fcButtonInWebView) {
      // iOS : bouton dans la SPA WebView
      await withWebView(async () => {
        try {
          await $(loc.fcButton).waitForDisplayed({ timeout })
          await $(loc.fcButton).click()
        } catch (ex) {
          if (!oidcConcurrencyBugOnIOs) console.warn('bouton de mire de connexion introuvable', ex)
        }
      })
    } else {
      // Android : bouton natif
      try {
        await $(loc.fcButton).waitForDisplayed({ timeout })
        await $(loc.fcButton).click()
      } catch (ex) {
        if (!oidcConcurrencyBugOnIOs) console.warn('bouton de mire de connexion introuvable', ex)
      }
    }
  }
}
export default traced(new LoginPage(), 'LoginPage')
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
| Submit formulaire FCP-LOW | `tl().getByRole('button', ...)`, fallback `driver.execute()` documenté (bug WKRDP) | `tl().getByRole('button', ...)` — pas de fallback nécessaire |
| Clic JS vs pointer events | fallback JS hash | pointer events Chromedriver natifs |
| Wait post-OIDC | `waitUntil(url !== spaUrl)` | pas nécessaire (bouton déjà en WebView) |

### Avant de brancher, chercher un signal DOM commun

Un branchement `if (driver.isIOS)` n'est justifié que si le comportement diffère **réellement**, pas juste par habitude de la première implémentation. Exemple : détecter la fin du logout attendait `driver.getContexts()` (iOS, pour repérer la réapparition d'un contexte WebView) ou le bouton FC natif (Android) — deux chemins de code pour un même événement. En observant que la modale de confirmation du logout disparaît du DOM sur les deux plateformes, un simple `confirmBtn.waitForDisplayed({ reverse: true })` remplace les deux branches. Avant d'écrire un branchement plateforme, vérifier qu'aucun signal DOM/WebView commun ne couvre déjà les deux cas.

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/pages/locators/login.locators.ts` — exemple complet d'interface + dispatch `getLoginLocators()`.
- `webdriverio/src/pages/login.page.ts` — Page Object sans sélecteur direct, catch loggé en best-effort.
- `webdriverio/src/pages/locators/demarches.locators.ts` — locators partagés sans dispatch (DOM WebView identique iOS/Android).
- `webdriverio/src/pages/avatar-menu.page.ts` — `logout()`, signal DOM commun (disparition de la modale) au lieu du polling de contextes.
- `webdriverio/src/pages/locators/notifications.locators.ts` — cas où **tout** est en WebView : le fichier locators est vide de sélecteurs natifs, les queries TL sont inline dans le Page Object.

## 5. Sources

- Plan `.claude/plan-i-want-a-webdriver-shiny-rossum.md` — architecture initiale POM 3 niveaux
- Commit `301c6a6` — migration des locators natifs et requêtes TL inline
