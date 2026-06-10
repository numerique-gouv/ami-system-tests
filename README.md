# WebdriverIO + Appium — Tests E2E AMI

## Architecture actuelle : Page Object Model + Testing Library

### Principe

Les tests s'appuient sur deux couches :

1. **Page Objects** (`src/pages/*.page.ts`) — actions métier sans sélecteurs directs
2. **Requêtes sémantiques** (`@testing-library/webdriverio`) — trouvent les éléments comme un utilisateur les perçoit

```
test (scénario utilisateur)
  └── Page Object (action métier : "ouvrir l'inbox")
        └── tl().getByRole / findByText  (élément par rôle ARIA ou texte visible)
```

### Sélecteurs WebView : Testing Library

Dans les WebViews (SPA Svelte), les éléments sont trouvés par leur **sens**, pas par leur structure DOM :

```typescript
// Avant (CSS fragile)
const bell = $('#notification-icon a')
const item = $(`//*[normalize-space(.)="${title}"]`)

// Après (sémantique — résiste aux refactos CSS/layout)
const bell = await tl().getByRole('link', { name: /notifications/i })
const item = await tl().findByText(title, {}, { timeout: 20000 })
```

`tl()` retourne les requêtes Testing Library liées au contexte WebView courant. Il doit être appelé à l'intérieur d'un callback `withWebView()`.

Queries disponibles : `getByRole`, `getByText`, `getByLabelText`, `getByPlaceholderText`, `findBy*` (async, avec attente), `queryBy*` (retourne null si absent).

### Sélecteurs natifs : accessibility id

Pour les éléments natifs (SwiftUI / Compose), on utilise les accessibility identifiers :

```typescript
// iOS accessibilityIdentifier / Android contentDescription
$('~franceConnect button')
'-ios predicate string:label == "Peut-être plus tard"'
```

---

## Prochaine étape : Screenplay Pattern

### Pourquoi ?

Le Page Object Model a une limite : il pense en **pages** alors que les tests devraient penser en **comportements utilisateur**. Avec POM, un test ressemble à :

```typescript
await LoginPage.tapFranceConnect()
await FranceConnectPage.loginWithSandbox()
await OnboardingNotificationsPage.dismiss()
await NotificationsInboxPage.openFromHome()
```

Ce n'est pas faux, mais ce n'est pas non plus une user story. Le Screenplay Pattern résout ça.

### Le modèle Screenplay

Quatre concepts :

| Concept | Rôle | Exemple |
|---------|------|---------|
| **Actor** | Qui fait l'action | `const alice = Actor.named('Alice')` |
| **Ability** | Ce que l'acteur peut faire | `BrowseTheWebWithWebdriverIO.using(browser)` |
| **Task** | Ce que l'acteur fait (business) | `LoginViaFranceConnect()` |
| **Question** | Ce que l'acteur observe | `TopNotificationTitle()` |

### À quoi ressemblerait le test avec Screenplay

```typescript
import { Actor } from '@serenity-js/core'
import { BrowseTheWebWithWebdriverIO } from '@serenity-js/webdriverio'

describe('Notifications', () => {
  let alice: Actor

  before(() => {
    alice = Actor.named('Alice').whoCan(BrowseTheWebWithWebdriverIO.using(browser))
  })

  it("reçoit une notification dans l'inbox malgré refus OS", async () => {
    await alice.attemptsTo(
      LoginViaFranceConnect(),
      DeclineNotificationOnboarding(),
      OpenNotificationsInbox(),
    )

    const title = `AMI-vanilla-${Date.now()}`
    await publishNotification({ title, body: 'Test' })

    await alice.attemptsTo(RefreshInbox())

    await alice.asks(
      Ensure.that(TopNotificationTitle(), equals(title))
    )
  })
})
```

Les Tasks encapsulent tout le détail technique :

```typescript
// tasks/LoginViaFranceConnect.ts
export const LoginViaFranceConnect = () =>
  Task.where('#actor se connecte via FranceConnect',
    // dismiss staging picker si présent
    TryTo(SelectStagingEnvironment()),
    // clic bouton FC dans la WebView
    Click.on(PageElement.located(By.role('button', { name: /FranceConnect/i }))),
    // gère optionnellement la page eIDAS
    TryTo(SelectEidasFaible()),
    // remplit et soumet le formulaire FCP-LOW
    Enter.theValue(FC_IDENTIFIER).into(PageElement.located(By.id('login'))),
    Enter.theValue(FC_PASSWORD).into(PageElement.located(By.id('password'))),
    Press.the(Key.Enter),
    Wait.until(PageElement.located(By.id('mire')), isNotPresent()),
  )
```

### Bénéfice concret

- Le test lit comme une user story — utile pour les PO/QA non-techniques
- Les Tasks sont composables et réutilisables entre scénarios
- Les rapports Serenity/JS décrivent les actions en langage naturel avec screenshots

### Quand migrer ?

Le Screenplay vaut l'investissement quand :
- **> 15-20 scénarios** qui partagent des séquences d'actions
- Une **équipe QA non-dev** lit ou écrit les tests
- Les tests actuels deviennent difficiles à maintenir (copier-coller de séquences)

Pour ce projet aujourd'hui, le POM + Testing Library est le bon niveau. À revisiter si la suite de tests s'étoffe.

### Librairie de référence

`@serenity-js/webdriverio` — [serenity-js.org](https://serenity-js.org)

```bash
npm install @serenity-js/core @serenity-js/webdriverio @serenity-js/assertions
```

La configuration se fait dans `wdio.base.conf.ts` via le reporter Serenity/JS.
