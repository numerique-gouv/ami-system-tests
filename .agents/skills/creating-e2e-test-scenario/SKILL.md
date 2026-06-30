---
name: creating-e2e-test-scenario
description: >
  Workflow complet de création d'un scénario de test E2E pour l'application AMI (WebdriverIO + Appium, iOS + Android).
  Utiliser ce skill dès que l'utilisateur décrit un parcours utilisateur à tester, souhaite écrire un nouveau test E2E, ou veut automatiser une séquence d'écrans observée dans l'app.
  Le skill couvre tout : planification → vérification live via MCP wdio → implémentation guideline-conforme → exécution Android + iOS → revue conformité → proposition de refactoring.
---

# Workflow : Création d'un scénario de test E2E

Ce skill est un **orchestrateur** : il enchaîne les outils MCP wdio, les skills spécialisés existants, et la validation utilisateur dans le bon ordre. Il ne fait jamais le travail bas-niveau lui-même — il délègue et décide.

## Vue d'ensemble des phases

```
PHASE 1 : Plan          → décrire + vérifier live + valider avec l'utilisateur
PHASE 2 : Implémentation → scaffold + code WDIO guideline-conforme
PHASE 3 : Vérification  → check-code + test-android + test-ios
PHASE 4 : Revue         → conformité guidelines + proposition de refactoring
```

---

## PHASE 1 — Plan du parcours utilisateur

### 1a. Rédiger le plan

Avant d'écrire une ligne de code, rédiger en prose un plan du parcours utilisateur :

- **Préconditions** : état de l'app au démarrage (utilisateur connecté ? page de départ ?)
- **Étapes** : liste ordonnée des actions utilisateur (navigation, clics, saisies)
- **Assertions** : ce qu'on vérifie à chaque étape clé (texte visible, URL, état d'un élément)
- **Postconditions** : état de l'app en fin de scénario

Le plan doit être "implémentable" : chaque action doit cibler un écran ou un élément concret de l'app AMI.

### 1b. Vérifier le parcours en live via MCP wdio

Avant de soumettre le plan à l'utilisateur, **l'exécuter soi-même** avec les outils MCP wdio pour confirmer que chaque étape est faisable :

1. Connecter une session : `mcp__wdio__start_session` avec `noReset: true` sur le simulateur/émulateur courant
2. Parcourir les écrans : `mcp__wdio__get_screenshot` après chaque action pour observer l'état réel
3. Identifier les sélecteurs stables (accessibility id, rôle ARIA, texte visible)
4. Ajuster le plan si un écran ne correspond pas à ce qui était anticipé

Si un élément n'est pas trouvable → noter l'obstacle dans le plan et proposer une alternative.

**Toujours fermer la session MCP proprement** après la vérification (ou laisser `auto-detach` gérer).

### 1c. Soumettre le plan à l'utilisateur

Présenter le plan finalisé avec :
- Le parcours en prose (préconditions → étapes → assertions → postconditions)
- Les sélecteurs identifiés lors de la vérification live
- Les obstacles éventuels et les alternatives proposées

**Attendre la validation explicite de l'utilisateur avant de passer à la Phase 2.**

---

## PHASE 2 — Implémentation

### Règles d'or (non négociables)

1. **Suivre les guidelines** dans `docs/guidelines/`. Lire au minimum :
    - `cross-platform-page-objects.md` — POM 3 niveaux obligatoire
    - `webview-context-switching.md` — `withWebView()` seul autorisé
    - `semantic-locators.md` — `tl()` en WebView, `accessibility id` en natif
    - `assertion-quality.md` — `waitUntil` avec `timeoutMsg`, pas de `browser.pause`
    - `spa-navigation.md` — navigation SPA hybride

2. **Ne jamais modifier** une méthode de Page Object existante. Si une méthode existante fait 80% de ce qu'on veut mais pas exactement : écrire une **2e méthode distincte** dans le même fichier Page Object, avec un nom différent.

3. **POM 3 niveaux** :
    - `tests/*.test.ts` : zéro sélecteur, zéro import de `withWebView`/`tl`
    - `pages/*.page.ts` : actions métier, `withWebView`/`tl` inline, appel `getXxxLocators()`
    - `pages/locators/*.locators.ts` : sélecteurs natifs et CSS par plateforme

### 2a. Explorer les Page Objects existants

Avant d'écrire quoi que ce soit, parcourir `src/pages/` pour identifier :
- Les méthodes déjà disponibles qui couvrent tout ou partie du parcours
- Les locators existants qui pourraient servir

Lister explicitement : "Ces méthodes existantes seront réutilisées : [...]. Ces nouvelles méthodes seront créées : [...]."

### 2b. Écrire le plan markdown du test

Convertir le plan utilisateur en un plan markdown structuré (describe/it/hooks en prose, sans code WDIO). Ce plan servira d'input au skill `creating-test-structure`.

### 2c. Scaffolding

Invoquer le skill `creating-test-structure` avec le plan markdown pour générer la structure `describe`/`it`/hooks avec pseudo-code.

### 2d. Implémentation WDIO

Invoquer le skill `writing-webdriverio-code` pour convertir le scaffold en code WDIO réel.

Contraintes spécifiques au projet AMI (en plus des règles du skill) :

- Utiliser `driver.execute(() => btn.click())` quand un `<a>` overlay intercepte le clic d'un bouton (pattern documenté dans `webview-context-switching.md`)
- Utiliser `browser.waitUntil` avec `timeoutMsg` explicite pour toute sentinelle de navigation
- Utiliser `driver.execute` (JS synchrone) comme sentinelle de navigation, jamais `tl()` dans un `waitUntil` (pattern documenté dans `semantic-locators.md` §3)
- Les sélecteurs CSS utilisés dans `driver.execute` doivent être dans `pages/locators/*.locators.ts`

---

## PHASE 3 — Vérification

### 3a. Vérification statique

```bash
just check-code
```

Corriger toutes les erreurs TypeScript et lint avant de continuer. Ne pas passer à l'exécution tant que `check-code` échoue.

### 3b. Exécution Android

```bash
just test-android src/tests/<nom-du-test>.test.ts
```

En cas d'échec → invoquer le skill `investigate-failing-tests` avec les détails de l'erreur. Itérer jusqu'à ce que le test passe.

### 3c. Exécution iOS

```bash
just test-ios src/tests/<nom-du-test>.test.ts
```

Même discipline que pour Android. Les deux plateformes doivent passer avant de considérer le test terminé.

### 3d. Vérification absence de régression

Après que le nouveau test passe sur les deux plateformes, vérifier qu'aucun test existant n'a été cassé :

```bash
just test-android
just test-ios
```

Si des tests existants sont en échec alors qu'ils passaient avant, investiguer et corriger avant de conclure.

---

## PHASE 4 — Revue et proposition de refactoring

### 4a. Revue conformité guidelines

Passer en revue le code produit (Page Objects, locators, test) et identifier **chaque écart** avec les guidelines dans `docs/guidelines/`.

Pour chaque écart, proposer l'une de ces deux options :

**Option A — Corriger le code** : si l'écart est une erreur claire (sélecteur fragile, `browser.pause`, import de `tl()` dans un test, etc.)

**Option B — Interviewer l'utilisateur pour mettre à jour la guideline** : si l'écart reflète un cas nouveau ou légitime que la guideline n'anticipait pas (pattern nouveau, contrainte technique non documentée, décision d'équipe à acter)

Présenter la liste des écarts avec la proposition A ou B pour chacun. Attendre la décision de l'utilisateur avant d'agir.

### 4b. Proposition de refactoring

Identifier les **nouvelles méthodes** créées dans les Page Objects et les **méthodes existantes proches** (même domaine métier, même type d'action).

Pour chaque paire candidate à la fusion :

1. Lister la différence fonctionnelle entre les deux méthodes
2. Chercher **tous les appelants** de chacune dans le codebase :
   ```bash
   grep -rn "nomMethode" src/
   ```
3. Lister les fichiers de test impactés par la fusion potentielle
4. Proposer d'exécuter leurs tests sur Android ET iOS pour garantir l'absence de régression **avant** toute fusion

Ne pas fusionner sans avoir exécuté les tests des appelants. Ne pas fusionner si l'utilisateur n'a pas validé la proposition.

---

## Conventions de communication

- Toujours indiquer clairement dans quelle phase on se trouve
- Ne jamais affirmer "le test passe" sans avoir vu la sortie de `just test-android` / `just test-ios`
- En cas de blocage après 3 tentatives de correction (Phase 3), s'arrêter et demander à l'utilisateur les contraintes manquantes (même discipline que `investigate-failing-tests`)
- Les sélecteurs choisis lors de la vérification MCP live sont indicatifs — le code final doit privilégier `tl().findByRole` / `tl().findByText` sur les sélecteurs CSS bruts
