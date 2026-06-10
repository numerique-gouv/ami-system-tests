# Règles équipe — Surcharges pour les skills WebdriverIO

Ce fichier définit les conventions projet qui priment sur le comportement par défaut des skills.
Pour la documentation approfondie, consulter `guidelines/` (chemin relatif depuis `webdriverio/`).

---

## Sélecteurs

Voir `guidelines/semantic-locators.md`.

- En WebView : utiliser Testing Library via `tl()` (`findByRole`, `findByText`, `findByLabelText`).
- En natif : utiliser `accessibility id` en priorité (même identifiant iOS/Android quand possible).
- Dispatch plateforme via `getXxxLocators()` — jamais de sélecteur en dur dans un page object.
- Interdits : `xpath` fragile, sélecteurs par classe CSS ou par index sauf contrat UI explicitement positionnel.

## Contexte WebView

Voir `guidelines/webview-context-switching.md`.

- Jamais d'appel direct à `driver.switchContext()` dans les tests ou les pages.
- Toujours utiliser `withWebView(async () => { ... })` — le `finally` garantit le retour en NATIVE.
- Pour le flow FranceConnect complet (OIDC multi-redirect), un seul `withWebView()` enveloppe tout le flow (voir `guidelines/oidc-redirect-handling.md`).

## Attentes et synchronisation

Voir `guidelines/assertion-quality.md`.

- `browser.pause()` est **interdit comme mécanisme de synchronisation**.
- Utiliser `waitUntil`, `waitForDisplayed`, `waitForClickable` selon la situation.
- Tout `waitUntil` doit inclure `timeoutMsg` pour identifier rapidement l'échec en CI.
- Petits `pause` documentés uniquement pour des contraintes d'animation connues et inévitables.

## Pattern WDIO v9 : ChainablePromiseElement

- `$(loc).method()` directement — jamais `(await $(loc)).method()` (déclenche TS [80007]).
- `await` uniquement devant `expect(wdioElement)` (matchers expect-webdriverio) ou devant une Promise.
- Jamais `await expect(string)`, `await expect(boolean)`, `await expect(number)`.

## Isolation des tests

Voir `guidelines/test-isolation.md`.

- `driver.reset()` est **interdit** (déprécié Appium 3) → utiliser `terminateApp` + `activateApp`.
- Utiliser `before` pour un état partagé stable sur la suite (ex : passer l'onboarding une fois).
- Utiliser `beforeEach` quand chaque test doit repartir d'un état propre (ex : onboarding.test.ts).
- `isVisible()` et les méthodes de détection doivent inclure try/catch avec `return await`.

## iOS WKWebView

Voir `guidelines/ios-wkwebview-quirks.md`.

- Appeler `refreshAxTree()` avant d'interagir avec des éléments après un redirect (ex : champs FranceConnect).
- `scriptTimeout` se remet à ~0 ms après chaque `switchContext` — `withWebView()` le réinitialise à 30 s automatiquement.

## Reporting Allure

Voir `guidelines/allure-reporting.md`.

- `addFeature` et `addSeverity` dans le `before` du `describe`.
- `addStep` pour tout scénario avec plus de 3 interactions distinctes.
- `addAttachment` (et non écriture disque seule) pour les artefacts d'échec.
- `addConsoleLogs: true` est **activé par défaut** dans `wdio.base.conf.ts`.

## Commandes

Toutes les commandes passent par `just`. Voir `justfile` pour la liste complète.

```bash
just --list          # découvrir les cibles disponibles
just check-code      # lint + typecheck — à lancer avant tout commit
```

## Tests skippés

Si un skill `skipped-test-manager` propose de skipper un test :
- Ouvrir d'abord un ticket de suivi.
- Documenter la raison dans un commentaire structuré ou dans `guidelines/`.
- Ne pas laisser de `.skip` sans date ni responsable.
