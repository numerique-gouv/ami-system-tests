# Isolation des tests : `before` vs `beforeEach` et indépendance des `it()`

## 1. Symptôme

- Le deuxième `it()` échoue parce que le premier a laissé l'app dans un état inattendu.
- Un test passe seul mais échoue quand la suite entière est lancée.
- Changer l'ordre des `it()` dans un fichier casse certains tests.
- `beforeEach` redémarre l'app entière pour chaque test alors qu'un simple retour en arrière suffirait.
- Après un échec en CI, le retry relance le test dans un état corrompu (mi-onboarding, token expiré).

## 2. Pourquoi

Il y a deux niveaux d'isolation dans ce projet :

| Niveau | Mécanisme | Quand |
|---|---|---|
| **Entre spec files** | Nouvelle session Appium (app réinstallée si `noReset: false`) | Automatique — chaque fichier `.test.ts` a sa propre session |
| **Entre `it()` dans un fichier** | `before` ou `beforeEach` | À choisir selon le coût du reset |

Le choix `before` vs `beforeEach` est un compromis entre **vitesse** et **isolation stricte**.

### `before` (une fois par `describe`)

Navigation coûteuse faite une seule fois : onboarding passé, authentification, etc.
Les tests qui suivent partagent cet état. Convient quand :
- Les tests ne modifient pas l'état global (lecture seule).
- Un test qui échoue laisse un état qui ne pollue pas les suivants.
- Le coût du reset par test est prohibitif (login OIDC ~30 s).

### `beforeEach` (avant chaque `it`)

Reset strict avant chaque test. Convient quand :
- Les tests modifient l'état de l'app (`toggleNotifications`, écriture de données).
- L'onboarding doit être rejoué (tests `Onboarding` qui testent le premier lancement).
- La fiabilité prime sur la vitesse.

## 3. Solution

### Règle de décision

```
Les tests modifient l'état ?
  ├── oui et reset bon marché (terminateApp) → beforeEach
  └── non ou reset coûteux (login OIDC)     → before + cleanup explicite (after)
```

### Cas 1 — État partagé avec `before` et nettoyage `after`

```typescript
// partner.test.ts — navigue vers le détail dans before, revient dans after
describe('Partenaire', () => {
  before(async () => {
    if (await OnboardingPage.isVisible()) await OnboardingPage.skip()
    await HomePage.waitForVisible()
    await HomePage.openFirstPartner()
  })

  after(async () => {
    await PartnerPage.goBack() // remet dans l'état avant le describe
  })

  it('affiche le nom du partenaire', async () => { ... })
  it('affiche la description', async () => { ... })
})
```

### Cas 2 — Reset strict avec `beforeEach`

```typescript
// onboarding.test.ts — l'onboarding ne se joue qu'au premier lancement
describe('Onboarding', () => {
  beforeEach(async () => {
    // terminateApp + activateApp = reset sans réinstallation (état préservé)
    await driver.terminateApp('fr.gouv.ami.staging')
    await driver.activateApp('fr.gouv.ami.staging')
  })

  it("affiche l'écran d'onboarding au premier lancement", async () => { ... })
  it("permet de passer l'onboarding", async () => { ... })
})
```

> **`driver.reset()` est déprécié** dans Appium 3.
> Utiliser `terminateApp` + `activateApp` (conserve l'installation, reset l'état mémoire)
> ou `fullReset: true` dans les capabilities pour une réinstallation complète.

### Cas 3 — Test qui modifie l'état : nettoyer explicitement

Un `it()` qui modifie l'état doit le remettre dans l'état initial avant de terminer,
ou placer le cleanup dans `afterEach`. L'état ne doit pas fuite sur le test suivant.

```typescript
// profile_deletion_at_logout.test.ts
before(async () => {
  // Capture des valeurs originales AVANT modification, pour restauration.
  original = { preferredUsername: /* ... */, email: await ProfilePage.getEmailBold(), /* ... */ }
})

after(async () => {
  // Restauration best-effort : protège le compte si un it() échoue avant le logout,
  // qui déclenche normalement la suppression des données côté app. Chaque étape est
  // catchée séparément pour ne pas abandonner la restauration au premier échec.
  if (!original) return
  try { await ProfilePage.editPreferredUsername(original.preferredUsername) } catch { /* silencieux */ }
  try { await ProfilePage.editEmail(original.email) } catch { /* silencieux */ }
})
```

### Indépendance des `it()` : règle absolue

Chaque `it()` doit pouvoir s'exécuter dans n'importe quel ordre et en isolation.

```typescript
// ❌ Test 2 dépend implicitement du résultat de test 1
it('ouvre le premier partenaire', async () => {
  await HomePage.openFirstPartner() // modifie l'état → on est sur la page partenaire
})
it('affiche le nom du partenaire', async () => {
  // suppose qu'on est sur la page partenaire — ne fonctionne que si test 1 a passé
  const name = await PartnerPage.getName()
})

// ✅ Navigation dans before — les tests sont indépendants de leur ordre
before(async () => { await HomePage.openFirstPartner() })
after(async () => { await PartnerPage.goBack() })
it('affiche le nom du partenaire', async () => { ... })
it('affiche la description', async () => { ... })
```

### Cas 4 — Exception : cycle de vie d'entité backend (suite séquentielle intentionnelle)

Quand les `it()` testent les **états successifs d'une même entité côté API** (ex. `new → wip → closed` pour une démarche partenaire), la dépendance entre `it()` est structurelle et ne peut pas être éliminée à coût raisonnable : rejouer le backend depuis zéro dans chaque `it()` impliquerait un login OIDC + une séquence de publications complète à chaque étape.

Dans ce cas, la suite peut partager un identifiant d'entité créé dans `before`, à condition que :
1. La dépendance soit documentée explicitement en commentaire dans le `describe`.
2. L'identifiant soit unique et horodaté (ex. `` `E2E-${new Date().toISOString()}` ``) pour garantir l'idempotence des runs successifs.
3. Chaque `it()` publie ses propres notifications et valide son état sans supposer l'état *local de l'app* laissé par le `it()` précédent (retour sur la page d'accueil explicite en début de `it()` si nécessaire).
4. Les `specFileRetries` relancent bien l'ensemble du spec file (nouvelle session → `before` rejoué) et non un `it()` isolé.

```typescript
/**
 * Les 3 tests partagent le même `itemId` (même démarche côté API, états successifs).
 * Exception documentée à la règle d'indépendance des it() — voir test-isolation.md §Cas 4.
 */
describe('Démarches — cycle de vie via notifications partenaire', () => {
  let itemId: string
  before(async () => {
    itemId = `E2E-${new Date().toISOString()}`
    // login OIDC ...
  })

  it('crée une démarche visible (statut new)', async () => {
    await publishNotification({ itemId, itemGenericStatus: 'new', ... })
    await HomePage.waitForDemarche(title)
    // ...
  })

  it('met à jour l'URL externe (statut wip)', async () => {
    await DemarchesPage.goToHome() // retour explicite, pas de supposition sur l'état local
    await publishNotification({ itemId, itemGenericStatus: 'wip', ... })
    // ...
  })
})
```

> **Limite** : si un `it()` intermédiaire échoue, les `it()` suivants échoueront également.
> C'est acceptable dans cette exception — l'échec est signalé au niveau de la suite entière,
> et le rapport Allure montre quelle étape du cycle a failli.

### Fuites d'état à surveiller dans ce projet

| Source de fuite | Impact | Remède |
|---|---|---|
| Notification publiée qui reste dans l'inbox | Fausse le décompte si la suite est rejouée | Titre unique `AMI-vanilla-${Date.now()}` |
| Toggle notifications non remis | Le test suivant démarre avec un état différent | Cleanup explicite en fin de test |
| Navigation laissée sur une page enfant | Le `before` du describe suivant peut trouver une page inattendue | `after` avec `goBack()` |
| Session OIDC iOS dans SFSafariViewController | Le login saute l'écran FC → `dismiss()` timeout | `just _reset-ios-fc-session` avant chaque run |

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/tests/onboarding.test.ts:5-9` — `beforeEach` avec terminateApp/activateApp.
- `webdriverio/src/tests/partner.test.ts:6-17` — `before` navigation + `after` cleanup.
- `webdriverio/src/tests/settings.test.ts:33-45` — `it()` qui modifie et remet l'état initial.
- `webdriverio/src/tests/notifications.test.ts:45` — `AMI-vanilla-${Date.now()}` pour l'idempotence.
- `webdriverio/justfile:_ios-reset-fc-session` — reset externe à la suite de tests.

## 5. Sources

- [WebdriverIO — Best Practices — Test Independence](https://webdriver.io/docs/bestpractices/)
- [Mocha — Hooks](https://mochajs.org/#hooks)
- [Appium — App Management: terminateApp / activateApp](https://appium.io/docs/en/latest/guides/manage-app/)
- [WebdriverIO — specFileRetries](https://webdriver.io/docs/configuration/#specfileretries) — voir aussi [retry-strategies.md](retry-strategies.md)
