# Recommandations de santé — Projet WebdriverIO

Généré le : 2026-06-03

---

## [RÉSOLU] Capture d'artefacts en cas d'échec

**Statut : résolu** — implémenté dans `wdio.base.conf.ts`.

Le hook `afterTest` :
- Prend un screenshot et l'attache à Allure via `AllureReporter.addAttachment`.
- Écrit aussi le PNG sur disque (`.wdio-logs/screenshots/`) pour les workflows hors Allure.
- Capture le DOM HTML si le contexte courant est `WEBVIEW` (conditionnel pour éviter le blocage iOS ~25 s sur `getPageSource` hors contexte stabilisé).

Référence : https://github.com/webdriverio/webdriverio/issues/2190#issuecomment-2245595191

---

## [DÉRIVE DOC/CODE] `addConsoleLogs: true` dans `allure-reporting.md`

**Statut : à corriger dans le guideline.**

`guidelines/allure-reporting.md` montre `addConsoleLogs: true` en commentaire avec le message « à activer ». Or cette option est déjà active dans `wdio.base.conf.ts:53` depuis la mise à jour de la configuration.

**Action** : mettre à jour `guidelines/allure-reporting.md` pour indiquer que l'option est activée par défaut et supprimer le faux commentaire dans l'exemple de code.

---

## [DIFFÉRÉ] Reporter JSON (`@wdio/json-reporter`)

**Statut : à évaluer avant implémentation.**

Les skills WebdriverIO suggèrent un reporter JSON pour faciliter le parsing machine des résultats (CI, dashboards). Le package `@wdio/json-reporter` n'est pas dans les dépendances actuelles et sa compatibilité avec WDIO v9 doit être vérifiée via Context7 avant ajout.

**Action** :
1. Vérifier la disponibilité de `@wdio/json-reporter` pour WDIO v9 via `npx context7 @wdio/json-reporter` ou la documentation officielle.
2. Si compatible, ajouter en `devDependencies` et configurer dans `wdio.base.conf.ts`.
3. Si absent pour v9, évaluer une alternative (`@wdio/dot-reporter` avec jq post-processing, ou export Allure JSON déjà généré).

Non bloquant pour le fonctionnement actuel.
