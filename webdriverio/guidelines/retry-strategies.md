# Stratégies de retry : trois niveaux à ne pas confondre

## 1. Symptôme

- Un test flaky passe au retry mais on ne sait pas pourquoi il a échoué.
- Un retry rejoue les logs dans le même flux et pollue Allure.
- L'app est dans un état corrompu (mi-onboarding, mi-login) au moment du retry.
- Un `mochaOpts.retries: 2` masque un bug réel en le noyant dans les retries.

## 2. Pourquoi

Il y a trois niveaux de retry, chacun avec un périmètre et un coût différents :

| Niveau | Mécanisme | Session Appium | Quand l'utiliser |
|---|---|---|---|
| **Spec** | `specFileRetries` | Fraîche (nouvelle session) | Instabilité environnement (simulateur, réseau) |
| **Applicatif** | Retry dans le code | Conservée | API tiers cold-start (5xx transitoires) |
| **Page Object** | `try/catch` dans le POM | Conservée | Élément instable post-redirect |

### Le piège de `mochaOpts.retries`

`mochaOpts.retries` relance le `it()` dans la **même session Appium**. Problèmes :
- L'état de l'app peut être corrompu (onboarding à moitié passé, token OIDC expiré).
- Les logs COMMAND/DATA/RESULT du premier essai restent dans le même flux — Allure ne peut pas distinguer les tentatives.
- Un bug réel qui passe au 2e essai par hasard devient invisible.

`specFileRetries` relance le fichier entier dans un **nouveau processus Appium** avec une session fraîche, des logs propres par tentative, et l'app réinstallée (si `noReset: false`).

## 3. Solution

### Niveau 1 — `specFileRetries` (instabilité environnement)

```typescript
// wdio.base.conf.ts
specFileRetries: 1,       // ← production : 1 retry avec session fraîche
// specFileRetries: 0,    // ← debug : mettre à 0 pour voir la vraie cause d'échec
specFileRetriesDelay: 0,
```

**En debug, mettre `specFileRetries: 0` et `logLevel: 'info'`** pour voir les logs bruts sans que le retry masque la cause.

### Niveau 2 — Retry applicatif (API tiers cold-start)

Pour les appels réseau sur un backend qui peut être en cold-start (Scalingo, Heroku) :

```typescript
const PUBLISH_MAX_RETRIES = 5
const PUBLISH_RETRY_DELAY_MS = 10000 // 10s entre tentatives

for (let attempt = 1; attempt <= PUBLISH_MAX_RETRIES; attempt++) {
  const response = await fetch(url, options)
  if (response.ok || response.status === 201) return
  // Pas de retry sur 4xx (erreur client, non transitoire)
  if (response.status < 500) break
  if (attempt < PUBLISH_MAX_RETRIES) {
    await new Promise(r => setTimeout(r, PUBLISH_RETRY_DELAY_MS))
  }
}
```

### Niveau 3 — Retry court dans le Page Object (élément instable post-redirect)

Pour les éléments qui réapparaissent brièvement (bouton FC en fin de redirect OIDC) :

```typescript
// Dans le test — timeout court + try/catch = best-effort
try {
  await LoginPage.tapFranceConnect(5000)
} catch {
  // Absent dans la majorité des cas — pas d'échec du test
}
```

Le Page Object accepte un `timeoutMs` paramétrable pour distinguer l'usage normal (15 s) de l'usage "best-effort" (5 s).

### Ne pas retrier les `findBy*` Testing Library

`findBy*` intègre déjà une attente interne (`timeout` en 3e argument). Augmenter le timeout est préférable à enrouler dans un retry :

```typescript
// ✅ Augmenter le timeout Testing Library
await tl().findByText(/faible/i, {}, { timeout: 8000 })

// ❌ Retry externe sur findBy* — double la complexité pour rien
for (let i = 0; i < 3; i++) {
  try { await tl().findByText(/faible/i); break } catch { await browser.pause(1000) }
}
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/wdio.base.conf.ts:59` — `specFileRetries: 0` (valeur de debug actuelle, commenter pour passer à 1 en CI).
- `webdriverio/src/helpers/notifications-api.ts:19-65` — retry 5×10s sur `publishNotification`.
- `webdriverio/src/tests/notifications.test.ts:31-35` — retry court bouton FC post-OIDC.

## 5. Sources

- Commits `a731ede` (introduction specFileRetries), `e54589f` (retry publishNotification), `9636a98` (retry court FC button)
- [WebdriverIO — specFileRetries](https://webdriver.io/docs/configuration/#specfileretries)
