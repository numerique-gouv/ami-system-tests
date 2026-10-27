# Contribuer aux tests E2E AMI

Ce document rassemble les **règles générales** à suivre pour écrire ou modifier un test. Pour installer, lancer les tests ou déboguer, voir le [README](README.md). Les cas particuliers (un seul écran, une seule méthode concernée) ne sont **pas** ici : ils sont documentés en commentaire directement dans le fichier de code concerné.

Avant d'appliquer ces règles, prendre en compte les skills WDIO du projet (`.claude/skills/`, voir
[CLAUDE.md](CLAUDE.md#skills-vs-règles-du-projet)) et leur contexte mis en cache dans
`.webdriverio-skills/` : ce cache peut contenir des conventions ou un état du modèle applicatif
déjà établis. S'il diverge de l'état réel observé d'une des apps (webapp, Android ou iOS), cette
désynchronisation constatée est en elle-même un critère pour relancer `reconstructing-app-model`
sur cette app, indépendamment d'un échec de test.

## Sommaire

1. [Page Objects — architecture 3 niveaux](#1-page-objects--architecture-3-niveaux)
    - [1bis. Logging](#1bis-logging)
2. [Sélection des éléments](#2-sélection-des-éléments)
3. [Attendre sa page, puis agir](#3-attendre-sa-page-puis-agir)
4. [WebView et contextes](#4-webview-et-contextes)
5. [Qualité des assertions](#5-qualité-des-assertions)
6. [Isolation des tests](#6-isolation-des-tests)
7. [Stratégies de retry](#7-stratégies-de-retry)
8. [Erreurs de test vs erreurs techniques](#8-erreurs-de-test-vs-erreurs-techniques)
9. [Rapports et dumps d'échec](#9-rapports-et-dumps-déchec)
10. [Règles de débogage](#10-règles-de-débogage)

---

## 1. Page Objects — architecture 3 niveaux

```
src/tests/mobile/    scénarios Mocha Android + iOS — zéro sélecteur, zéro if(driver.isIOS)
src/tests/webapp/    scénarios Mocha webapp — même contrainte
src/pages/           Page Objects — logique métier, dispatch via getXxxLocators()
src/pages/locators/  sélecteurs par plateforme + fonction getXxxLocators()
```

### Niveau 1 — `locators/*.locators.ts`

Un fichier par page. Une interface TypeScript des locators, un objet `androidXxxLocators`, un objet `iosXxxLocators`, une fonction `getXxxLocators()` qui dispatche selon `driver.isIOS`.

```typescript
export const androidLoginLocators: LoginLocators = {
    fcButton: '~franceConnect button', // accessibility id Android
    fcButtonInWebView: false,
}
export const iosLoginLocators: LoginLocators = {
    // Sélecteur `button=` : matching exact, pas de regex possible — apostrophe typographique
    // `’` (U+2019) copiée depuis le texte réel de la SPA, pas l'apostrophe droite du clavier.
    fcButton: "button=S’identifier avec FranceConnect",
    fcButtonInWebView: true, // le bouton est dans la WebView SPA sur iOS
}

export function getLoginLocators(): LoginLocators {
    return driver.isIOS ? iosLoginLocators : androidLoginLocators
}
```

**Exception : locators identiques sur les deux plateformes.**
Quand une page est entièrement en WebView avec un DOM identique iOS/Android, exporter un seul objet partagé plutôt que deux objets dupliqués — `getXxxLocators()` reste la seule API appelée par le Page Object, même si elle ne dispatche plus rien.
**Ne pas fusionner par anticipation** : si un seul champ diverge un jour, repasser au dual-object plutôt que d'ajouter un `driver.isIOS ? ... : ...` ponctuel dans l'objet partagé.

### Niveau 2 — `pages/*.page.ts`

- **Aucun sélecteur direct** — appel à `getXxxLocators()` à chaque méthode.
- Les éléments de la SPA (WebView/webapp) s'atteignent par les **sélecteurs natifs de WDIO 10 définis dans le fichier `locators/` de la page** (`roleSelector()`, `tag*=texte`, CSS : cf. §2) et par les aides de `src/helpers/spa/spa.ts` (`clickDisplayed`, `waitForHeading`, `isShown`…), appelées dans le Page Object. Le Page Object ne contient aucune chaîne de sélecteur (rôle + nom accessible n'ont de sens qu'en WebView : ils n'existent donc que dans les locators SPA).
- Exporté comme singleton tracé : `export default traced(new XxxPage(), 'XxxPage')`.
- `if (driver.isIOS)` acceptable **seulement** quand le *comportement d'interaction* diffère vraiment (pas juste le sélecteur) — ex. submit de formulaire OIDC (fallback `driver.execute` sur iOS pour le bug WKRDP, inutile sur Android), clic JS vs pointer events, attente post-redirect.
- **Avant d'écrire un branchement plateforme**, chercher si un signal DOM/WebView commun couvre déjà les deux cas (ex. la disparition d'une modale de confirmation est un événement observable identiquement sur iOS et Android — pas besoin de détecter la fin d'un logout différemment par plateforme).
- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'page-object'`), voir
  [§1bis Logging](#1bis-logging).

### Niveau 3 — `tests/*.test.ts`

Appelle uniquement des méthodes de Page Object. Le test se lit comme un scénario métier, sans détail d'implémentation ni sélecteur.

- **Jamais `console.*`** — utiliser le logger `@wdio/logger` (namespace `'test'`), voir
  [§1bis Logging](#1bis-logging).

#### Nom des specs : `<périmètre>.<catégorie>.test.ts`

Chaque spec (webapp, `nonreg/` et mobile) porte sa **catégorie** en suffixe, avant `.test.ts` ; le périmètre fonctionnel est en
kebab-case français (`profil-et-suppression-a-la-deconnexion.usage.test.ts`). Trois catégories :

| Catégorie | Ce que fait la spec | Exemples |
|-----------|---------------------|----------|
| `smoke` | prouve que l'essentiel fonctionne : authentification, arrivée sur l'accueil | `authentification.smoke.test.ts`, `accueil.smoke.test.ts` |
| `parcours` | parcourt des pages en **lecture seule** (liens sans 404, présence de la configuration, pages d'erreur), sans modifier le compte | `erreurs.parcours.test.ts`, `catalogue.parcours.test.ts` |
| `usage` | un cas d'usage de bout en bout, qui agit (démarche publiée, profil modifié, consentement, déconnexion) ; le périmètre fonctionnel est dans le nom | `suivi.usage.test.ts`, `passkey.usage.test.ts` |

Trois autres catégories ont été envisagées et NON retenues : `liens` (couvert par `parcours`), `natif` (la frontière natif / WebView
n'est pas figée : des pages seront promues en natif), `contrat` (pas de spec de contrat d'API dans ce dépôt).

Filtrer par catégorie avec un glob : `just test-webapp "src/tests/webapp/**/*.smoke.test.ts"`. Les suites `*_smoke` et `webapp_usage` de
`wdio.base.conf.ts` reposent sur ces mêmes motifs : la catégorie du nom de fichier fait donc entrer une spec dans une suite (section suivante).
`wdio.webapp.conf.ts` repère par le nom de fichier (`authentification.smoke.test.ts`, `passkey.usage.test.ts`) les specs qui exigent un
profil Chrome vierge : à garder en phase en cas de renommage.

#### Suites nommées (option native `suites` de `wdio.base.conf.ts`)

Source de vérité : l'objet `suites` de `wdio.base.conf.ts` (option native de WDIO, lancée par `--suite <nom>`). Listes plates de specs
(un worker par spec, jamais de tableau imbriqué). Préfixe `mobile_` (Android + iOS) ou `webapp_` (Chrome) ; jamais mélangés. Aucun
ordre particulier n'est requis : chaque spec s'authentifie seule et `wdio.webapp.conf.ts` vide le profil Chrome avant
`authentification.smoke` et `nonreg/passkey.usage` (cf. ci-dessus). Les suites sont définies par motif de catégorie : un nouveau
`*.smoke.test.ts` ou `*.usage.test.ts` y entre sans modifier la config ; `*_all` et `webapp_usage` citent les smoke d'abord, WDIO
dédoublonne en gardant la première occurrence.

| Suite | Déclencheur / usage | Contenu | Justification |
|---|---|---|---|
| `mobile_short` | CI en mise au point ; défaut des lancements manuels | `authentification.smoke` seule | quelques minutes : déboguer un workflow sans payer une campagne |
| `webapp_short` | idem | `authentification.smoke` seule | une ou deux minutes, mêmes raisons |
| `mobile_all` | **PR, merge, tag** (API et app Android) ; hors CI : **tester un déploiement** | tous les tests mobiles, smoke d'abord | la couverture mobile complète est la seule garantie sur les écrans natifs et le natif/WebView |
| `webapp_usage` | **PR, merge, tag** (API) | tous les `*.smoke` + tous les `*.usage` (nonreg compris) | ce que font les usagers, sans les parcours de navigation exhaustifs (`*.parcours`) |
| `mobile_smoke` | hors CI : **valider un déploiement** | motif `*.smoke.test.ts` mobile (aujourd'hui : authentification) | le minimum qui prouve que l'app et le backend déployé se parlent |
| `webapp_smoke` | hors CI : **valider un déploiement** | motif `*.smoke.test.ts` webapp (authentification, accueil) | idem, en quelques minutes ; le contrôle des liens externes (`catalogue.parcours`) n'en fait plus partie |
| `webapp_all` | hors CI : **tester un déploiement** | tous les tests webapp (smoke, usage, parcours ; nonreg compris) | recette complète d'un déploiement |

Suites supprimées (2026-10-27) : `all` et `api` (suites maison ; un fichier se désigne par `--spec`), `mobile_ci` et `mobile_nonreg` (remplacées par `mobile_all`), `webapp_nonreg` (remplacée par
`webapp_usage`, qui contient en plus les `*.smoke`), `mobile_auth` / `webapp_auth` / `auth` (remplacées par `*_short` ou `*_smoke`).

Lancer hors CI (mêmes suites, mêmes commandes qu'en local ; `AMI_ENV` choisit l'environnement, cf. `.env.local`) :

```bash
AMI_ENV=staging just test-webci --suite webapp_smoke   # valider un déploiement (webapp)
just test-android --suite mobile_smoke                 # valider un déploiement (mobile ; idem test-ios)
AMI_ENV=staging just test-webci --suite webapp_all     # tester un déploiement (webapp)
just test-android --suite mobile_all                   # tester un déploiement (mobile ; idem test-ios)
npx wdio run wdio.webapp.conf.ts --suite webapp_smoke   # appel natif, sans just (idem wdio.android.conf.ts / wdio.ios.conf.ts)
```

---

## 1bis. Logging

**Jamais `console.*`** dans le code qui tourne dans une session WDIO/Mocha (pages, tests, helpers appelés par ce code, hooks de config) — utiliser `@wdio/logger`, qui s'intègre au flux de logs WDIO :

```typescript
import logger from '@wdio/logger'

const log = logger('<namespace>')
```

N'ajouter cette constante que dans les fichiers qui l'utilisent réellement — `no-unused-vars` est une erreur de lint, pas un avertissement.

Un namespace par couche, tous activés à `'info'` dans `logLevels` (`wdio.base.conf.ts`) même quand le niveau global est
`'warn'` :

| Couche                                                          | Namespace     |
|-----------------------------------------------------------------|---------------|
| `pages/*.page.ts` (via `traced()`)                              | `page-object` |
| Hooks globaux `wdio.base.conf.ts`                               | `scenario`    |
| `tests/*.test.ts`                                               | `test`        |
| `helpers/partner-api/*.ts` (clients HTTP)                       | `api`         |
| `wdio.android.conf.ts` / `wdio.ios.conf.ts` / `wdio.webapp.conf.ts` (`onPrepare`, etc.) | `config`      |
| Autres `helpers/**/*.ts` appelés en session                        | `helper`      |

**Exception : scripts CLI hors session de test.** `src/scripts/*.ts` (lancés en dehors d'une suite WDIO, ex. `push-notification.ts`) restent en `console.*` : `@wdio/logger` n'apporte rien hors du flux WDIO, et cette sortie est un affichage terminal direct, pas un log de scénario.

---

## 2. Sélection des éléments

**Par défaut, sélectionner par le sens perçu par l'utilisateur**, pas par la structure DOM :

- **WebView / webapp** — **sélecteurs natifs de WDIO 10**, définis dans les fichiers `locators/` (jamais dans le Page Object) et utilisés avec `$()`, `$$()`, le chaînage et `expect(…)` :

  | Besoin | Sélecteur |
  |---|---|
  | élément par rôle et nom accessible **exact** | `role/button[name="Suivi"]`, construit par `roleSelector()` (`src/helpers/spa/selectors.ts`) |
  | texte visible qui **contient** (fragment sans apostrophe) | `button*=Voir les notifications` ; insensible à la casse : `button.*=valider` |
  | champ de formulaire | attribut stable (`input[name="login"]`) ; `aria/<libellé>` si le libellé suffit |
  | élément sans nom accessible stable | `[data-testid="x"]` (dernier recours, cf. plus bas) |
  | dans un conteneur | chaînage `$(conteneur).$(élément)` (ou l'option `within` des aides) |

  Les aides de `src/helpers/spa/spa.ts` s'appellent dans le `inWebContext` de l'appelant mobile (seules `isShown` et `clickDisplayed` ouvrent aussi le contexte elles-mêmes, pour les flows mixtes) : `waitForHeading`, `waitForRole`, `clickRole`, `clickButton`, `waitForButtons`, `waitForPageText` (attendent), `isShown`, `hasPageText` (sondes), `firstDisplayed` / `allDisplayed` (retournent un élément : à utiliser DANS un `inWebContext`), `clickDisplayed`, `visibleButtonTexts`, `checkboxStates`.
- **Natif** (hors WebView) — `accessibility id` (`~xxx`) de préférence à un XPath par texte ou un resource-id brut.

### Ordre de préférence

1. **Les aides `spa.ts` et les attentes de WDIO** (`waitForDisplayed`, `expect(…).toBeDisplayed()`, `waitForExist`) — elles réessaient jusqu'à trouver : c'est *le* mécanisme d'attente, il n'y a rien à enrouler dans une boucle (cf. §7). Augmenter `timeout` plutôt que d'ajouter un retry. WDIO 10 n'attend PAS l'existence d'un élément avant `click()` : attendre explicitement (`waitForClickable`, ou `waitForExist` pour un élément transparent).
2. **Les API WDIO indépendantes de la plateforme**, sur un élément déjà obtenu : `.click()`, `.getText()`, `.isSelected()`, `waitForClickable()`… Elles fonctionnent en natif comme en WebView — elles survivront à la « promotion » d'une page de la SPA en écran natif.
3. **`driver.execute()`** — dernier recours : c'est du JavaScript, donc **uniquement valable dans une WebView / webapp**, inutilisable le jour où l'écran devient natif. Un `driver.execute` doit porter un commentaire qui dit pourquoi les sélecteurs natifs et les API WDIO ne suffisent pas.

- **Testing Library (`tl()`) est retiré du projet**, et `src/helpers/dom-query.ts` (son portage, 296 lignes) aussi : `@testing-library/webdriverio` n'est plus maintenu, et WDIO 10 fournit `role/…`, `aria/…`, `tag*=…` et `expect(…)` avec attente. Ne plus importer `setupBrowser`, ne plus écrire `tl()`, `findBy*`, `getBy*`, `queryBy*`, `within()`, `findRole` ni `queryRole`.
- **Sondes** (savoir sur quel écran l'on est) : `isShown(sélecteur, timeout)` / `hasPageText`. Un `$$(sélecteur)` ne lève jamais de violation « strict » ; un `.catch(() => false)` sur un `$()` l'avalerait (cf. `EnvironmentPickerPage`, le seul endroit où elle est volontairement relancée).
- **Agrégats** (liste de textes, états de cases à cocher) : `visibleButtonTexts`, `checkboxStates`.
- Besoin non couvert : **ajouter une aide dans `src/helpers/spa/spa.ts`** et le sélecteur dans le fichier `locators/` de la page.

### Pièges établis (relevés le 2026-10-13, webapp, Android, iOS)

1. **`role/…[name=…]` compare le nom EXACTEMENT**, tel que le moteur le calcule. Chrome garde une espace finale pour un bouton icône + texte (`<button role="link">` eIDAS : « Démonstration eIDAS faible␠ ») : utiliser `button*=texte`. Un `&nbsp;` dans le titre (« Où habitez-vous&nbsp;? ») est normalisé différemment selon le moteur (Chrome en BiDi, script de WDIO sur mobile) : `h1*=Où habitez-vous`.
2. **Doublons.** Une liste d'éléments au même nom est normale (boutons icône « Ouvrir la modale… » : leur texte est un libellé d'accessibilité, pas un texte affiché), de même que les clones d'un carrousel Splide en boucle (`splide__slide--clone`, `aria-hidden`, `is-active`). `$()` lève alors une violation « strict » : prendre `firstDisplayed(sélecteur)` (premier élément affiché), ou, pour le carrousel, un parent unique : `li.splide__slide.is-visible:not(.splide__slide--clone)` puis chaînage.
3. **Une chaîne `$(parent).$(enfant)` gardée dans une variable garde son parent** résolu au premier usage : si le parent change (diapositive visible, page remplacée), la reconstruire à chaque appel (`const carte = () => $(parent).$(enfant)`).
4. **Après une navigation qui remplace le document** (déconnexion), un élément déjà résolu devient « belongs to different document » : attendre sa disparition avec `$(sélecteur).waitForDisplayed({reverse: true})`, pas avec l'élément cliqué.
5. **Un élément transparent** (`opacity: 0`, ex. flèches Splide hors survol) n'est pas « affiché » pour `isDisplayed()` mais reste cliquable : `waitForExist` puis `click()`.
6. **iOS : `getComputedLabel()` et `toHaveComputedLabel` ne sont pas implémentés** dans la WebView. Lire le texte visible (`getText()`).
7. **`aria/<libellé>`** (XPath documenté) a renvoyé sur Android et iOS un élément non éditable pour un champ (« invalid element state » au `clearValue()`) : cibler le champ par un attribut (`input[name=…]`).

### `data-testid` : dernier recours documenté

Avant d'ajouter un `data-testid`, essayer `clickRole`/`waitForRole`/`waitForPageText` (rôle, nom, texte) et ne basculer que si cette requête échoue **réellement**. Documenter alors l'échec observé en commentaire à côté du champ (pas « structure observée via l'inspection »). Deux cas justifiés : rôle+nom dupliqués sur la page, ou texte imprévisible (contenu dynamique).

### Classes CSS : DSFR oui, Svelte hashé non

Les classes du design system État (`fr-tile__content`, `fr-badge`, `fr-tabs__tab--selected`) sont un contrat stable, utilisables comme sélecteur — après `data-testid` si une requête sémantique ne suffit pas. Les classes générées par Svelte (`svelte-19k7n5y`) changent à chaque build : **jamais** comme sélecteur.

### Apostrophes : fragment sans apostrophe, ou caractère copié du DOM

Le contenu FR (DSFR, Svelte) utilise souvent l'apostrophe typographique `’` (U+2019) ; la taper à la main en `'` (U+0027) casse le test au runtime. Pour un texte « contient », choisir un fragment **sans apostrophe** (`button*=Votre démarche n`). Pour un nom exact (`roleSelector`), copier l'apostrophe depuis le DOM ou les sources de la SPA (`just webview <cible>`, `just s <cible> find`), jamais la retaper, et la documenter en commentaire du locator.

### Écran natif

Ni les sélecteurs `role/…` ni `driver.execute()` n'ont de prise sur les éléments natifs XCUITest/UiAutomator2 : `$()` avec des sélecteurs natifs y est **obligatoire**, pas un choix de style. Ne pas `await` le `$()` lui-même — il se re-résout à chaque commande et résiste aux changements de navigation.

Pour atteindre un élément hors écran dans une liste native, **`element.scrollIntoView({direction: 'up', maxScrolls})`** (WDIO 10, défile jusqu'à ce que l'élément soit affiché) — pas de boucle de swipe écrite à la main. Le conteneur par défaut est `//android.widget.ScrollView` sur Android (introuvable pour une liste Compose : passer `scrollableElement`) et l'application entière sur iOS. Exemple : `EnvironmentPickerPage.reviewEnvironmentPicker`.

```typescript
const tile = $(loc.pickerTile)
await tile.waitForClickable({timeout: 15000})
await tile.click()
```

Le raisonnement détaillé du choix d'API (historique) est archivé dans l'ADR `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`.

---

## 3. Attendre sa page, puis agir

Même modèle que `docs/process/model/spec.md` (§3.3 et §4.2) : **un écran se vérifie lui-même ; une action source ne vérifie jamais sa destination.**

1. **Chaque méthode publique d'un Page Object commence par s'assurer qu'elle est sur sa page** — une attente (`waitForHeading`, `waitForRole`) avec `timeout` sur le titre (`heading`) ou le rôle de l'élément qu'elle va utiliser. Jamais via `window.location.hash` (le hash peut changer avant que le contenu soit rendu).
2. **Une méthode qui navigue ne connaît pas la page suivante** : elle clique (ou fixe la route) et rend la main. Les Page Objects ne s'importent pas entre eux (hors `NavigationPage` et les helpers). L'arrivée est vérifiée par la page cible, via une méthode d'identité `assertDisplayed()` ; quand le titre est dynamique, il est passé en argument (`DemarcheDetailPage.assertDisplayed(title)`). Le scénario enchaîne les deux, ce qui se lit comme un parcours :

   ```typescript
   await HomePage.openAllEvents()
   await AgendaPage.assertDisplayed()
   ```

   Faire retourner à la méthode de navigation le Page Object cible est une solution de dernier recours (dépendances circulaires entre pages) : à éviter tant qu'elle n'est pas nécessaire.
3. **Par défaut, on ne vérifie pas qu'une action est terminée** : le clic est supposé pris en compte, la page suivante vérifiera son arrivée. C'est une **exception** qui demande une preuve — un clic dont la perte est établie (re-rendu concurrent). La postcondition porte alors sur la **page d'origine** (`clickButtonUntilGone` : le bouton disparaît), jamais sur la page suivante ; on n'observe pas le réseau.
4. **Page au contenu imprévisible** (services du catalogue) : vérifier seulement que ce n'est pas une page d'erreur.
5. **Donnée asynchrone** : une page abonnée au temps réel (accueil, inbox de notifications via WebSocket) se met à jour en place — attendre simplement avec une primitive `spa.ts`. Une page sans abonnement (Suivi) ne se met à jour qu'au chargement : recharger entre deux essais avec un backoff (référence : `SuiviDemarchesPage.waitForDemarche`).
6. **Ne pas vérifier la disparition d'un composant** après une action : les pages se recyclent, la résolution d'un élément disparu génère des warnings bénins **et attend la durée du timeout**.

### Cas nominal et écarts : le Page Object décrit la cible, les écarts sont des anomalies visibles

L'app est testée sur des contextes **modernes** (appareil et OS récents) **et anciens** (vieil appareil, vieil OS, surcouche constructeur). Le comportement attendu est le même partout ; quand il ne l'est pas, c'est une **anomalie**, pas une variante normale.

- **Le code d'un Page Object suit le parcours nominal** : la cible. Exemple : **un seul tap** sur « S'identifier avec FranceConnect ».
- **Un écart (appareil ancien contre moderne, WebView, surcouche constructeur, état résiduel…) est écrit dans le code du Page Object**, par une branche **explicite et facultative**, pour qu'il saute aux yeux en revue. Elle porte :
  1. un **commentaire** qui sépare ce qui est **constaté** (appareil, version, date) de ce qui n'est qu'une **hypothèse** ;
  2. un **`log.warn('ANOMALIE …')`** émis **quand elle se déclenche**, pour que le journal du test la montre ;
  3. une attente **courte** et une absence **sans effet** : un appareil conforme à la cible ne doit jamais échouer à cause d'elle.
- **Ne pas cacher un écart** dans un fichier de locators ou de configuration (ils décrivent le chemin nominal : sélecteurs, contexte) ni le traiter en silence (`log.info`, ou rien) : il deviendrait une variante « normale » que plus personne ne remet en cause.
- **Une branche d'écart est temporaire** : quand l'app est corrigée, on la supprime ; le `warn` dit si elle sert encore.

Exemples du dépôt : le 2e tap FranceConnect sur Android (`FranceConnectMirePage.tapFranceConnect`), l'onboarding des notifications affiché en natif au lieu de la route SPA sur Android (`OnboardingNotificationsPage.isOnboardingVisible`), la WebView restée sur `/?is_logged_out` après une déconnexion (`FranceConnectMirePage.reloadSpaRootIfLoggedOut`).

### Squelette d'une page WebView

```typescript
await clickRole('button', 'Modifier')                       // attend la page, puis agit
await fillByLabel(/Nom d.usage/, 'Nouvelle valeur')
await clickRole('button', 'Enregistrer', {timeout: 5000})
```

---

## 4. WebView et contextes

Le point de couplage Appium/mobile (bascule de contexte, gestes natifs, dispatch iOS/Android) est isolé derrière `PlatformAdapter` (`src/platform/types.ts`), avec une implémentation par plateforme : `appiumAdapter` (Android/iOS) et `browserAdapter` (webapp). `platform()` retourne la bonne selon `browser.isMobile`.

```typescript
interface PlatformAdapter {
    readonly kind: 'android' | 'ios' | 'webapp'
    readonly fcButtonIsNative: boolean   // true sur Android seulement

    inWebContext<T>(callback: () => Promise<T>): Promise<T>
    isWebContextAvailable(): Promise<boolean>
    refreshAxTree(): Promise<void>       // no-op hors iOS
    pullToRefresh(): Promise<void>
}
```

- **`platform().inWebContext()` est la seule façon d'atteindre le DOM de la SPA** — jamais `driver.switchContext()` directement. Sur mobile, il bascule `NATIVE_APP` → `WEBVIEW_*` et remet le contexte qui était actif à l'entrée dans un `finally`, même en cas d'exception. Sur webapp, il est quasi-identité. **Il est réentrant, d'après l'état réel du driver** (`getContext()`), pas un compteur : si une WebView est déjà active à l'entrée (appel imbriqué, ou contexte basculé ailleurs), le callback s'y exécute sans qu'on y touche, ni à l'entrée ni à la sortie — la WebView active est conservée, quelle qu'elle soit (plusieurs WebViews possibles) ; sinon (`NATIVE_APP`), il bascule vers la première WebView et restaure le contexte d'origine dans le `finally`. **Convention d'appel (décision du 2026-10-26)** : l'enveloppe est posée par l'APPELANT MOBILE (un seul `inWebContext` englobant par test, hook ou flow), JAMAIS dans un spec webapp (sans effet) et pas dans les Page Objects ni les aides. Exceptions gardées : les flows mixtes natif/WebView (`authenticate.process.ts`, pages d'onboarding, pages FranceConnect, `isShown`/`clickDisplayed`/`session.ts` qu'ils appellent) s'enveloppent eux-mêmes, car l'enveloppe du test ne peut pas couvrir leurs étapes natives. Seule contrainte : une aide qui **retourne un élément** (`firstDisplayed`, `allDisplayed`) se lit et s'utilise dans un `inWebContext` ouvert, car l'élément ne survit pas à la sortie de la WebView.
- **Plusieurs WebViews** (AMI, puis une par partenaire) : `platform().inWebContext({title: 'Titre de la page'}, callback)` vise une WebView par son **titre** (chaîne « contient » ou RegExp), plus stable que l'URL. Si aucun titre ne correspond (après 5 s : les métadonnées des contextes retardent), un `log.warn` le dit et on prend la **dernière WebView de la liste hors workers** ; sans cible, c'est aussi la dernière hors workers. Un identifiant de contexte n'identifie pas une WebView sur Android (`WEBVIEW_<package>` partagé : la bascule se fait par `webviewPageId`) ; les workers (service worker…) sont écartés, et sur Android on préfère les WebViews attachées et visibles. Une cible différente de la WebView active bascule vers elle puis remet l'ancienne.
- Les sélecteurs CSS/XPath ne fonctionnent qu'en `WEBVIEW_*` (mobile) ; les gestes natifs (swipe, pull-to-refresh) et les sélecteurs natifs ne fonctionnent qu'en `NATIVE_APP`. Un geste natif **ne doit jamais** être appelé depuis l'intérieur d'un `inWebContext()`.
- **Flow OIDC FranceConnect : un seul `platform().inWebContext()`** pour tout le flow (eIDAS → identifiants → callback). Cas particulier : sortir du contexte WebView au milieu de *ce flow précis* provoque un blocage ~25 s sur iOS. Les réglages WDA/WebKit essayés sans effet contre les blocages iOS sont listés dans `docs/adr/2026-10-27-blocage-webkit-wda-experiences.md`.
- **Naviguer par un vrai clic utilisateur** (`clickRole(…)`, ou `$(sel).click()` après `waitForClickable()`) plutôt que `driver.execute(() => el.click())` — le clic JS est silencieux sur iOS en cas d'échec.
- **Les éléments ne survivent pas à un switch de contexte** : toute interaction WebView se fait dans `platform().inWebContext()`, pas avec les matchers WDIO natifs.

---

## 5. Qualité des assertions

La qualité d'une assertion se mesure au message produit en cas d'échec.

```typescript
// ✅ La valeur réelle apparaît dans le message d'échec
expect(title).not.toBe('')
expect(version).toMatch(/\d+\.\d+/)
expect(newTop).toEqual(expectedTitle)

// ❌ Seul le fait d'être non-vide/typé est vérifié — valeur cachée
expect(title.length).toBeGreaterThan(0)
expect(typeof enabled).toBe('boolean')
```

- **`await` devant `expect`** uniquement quand `expect` reçoit un élément WDIO (matcher qui retourne une Promise) :
  `await expect($(loc)).toBeDisplayed()`. Jamais devant une valeur déjà résolue (`string`/`boolean`/`number`) — ça déclenche l'avertissement TypeScript `[80007]` et n'a aucun effet.
- **`waitUntil` : toujours passer `timeoutMsg`.** Sans lui, le rapport ne montre qu'un cryptique « Timeout exceeded ».
- **Asserter une absence via `waitUntil`, jamais par un check immédiat** — après une action qui change l'état, la SPA a besoin d'un cycle de rendu ; un check immédiat produit souvent un faux positif (l'élément est encore dans le DOM).
- **Fusionner les vérifications séquentielles sur un même item.** Dès qu'un scénario doit vérifier N critères sur le même élément/la même liste, écrire une seule méthode de Page Object qui les vérifie tous dans le même `waitUntil`, avec une variable d'état (`failReason`) qui capture jusqu'où l'attente est allée avant d'échouer — pas N méthodes à un seul critère chacune (deux sources de flakiness au lieu d'une, et un message d'échec qui ne dit pas lequel des deux critères a échoué).
- **Ne pas doubler `waitForDisplayed` et `isDisplayed`** — `waitForDisplayed`/`waitForVisible`
  garantit déjà l'affichage ; un `isDisplayed()` qui suit immédiatement est redondant.

---

## 6. Isolation des tests

Deux niveaux d'isolation : entre fichiers de spec et entre `it()` d'un même fichier (`before` vs
`beforeEach`, à choisir).

L'isolation entre fichiers de spec dépend du mode de lancement. Avec `just test-android`/`test-ios`/
`test-webapp` (`--spec`) ou hors suite nommée, chaque fichier obtient une session fraîche, automatiquement.
Les suites nommées (`just test-android --suite <nom>` ou `npx wdio run <config> --suite <nom>`, voir `wdio.base.conf.ts`) sont des **listes plates de
specs**, équivalentes à `--spec a --spec b` : un worker (une session WebDriver) par fichier, exactement comme en ligne de commande —
une suite ne fait que désigner des fichiers, elle ne change pas la façon de les exécuter (les anciens groupes `[[a, b]]`, qui
fusionnaient les specs en un seul worker, sont supprimés). L'état est cependant conservé d'un fichier à l'autre sans session partagée :
profil Chrome du run en webapp, app non redémarrée sur Android ; seules `authentication` et `nonreg/passkey` repartent d'une session
vierge. Un test qui modifie l'état global doit en tenir compte : ne pas supposer une session fraîche du seul fait d'être dans un
nouveau fichier. Nommage : `mobile_*` (Android/iOS) et `webapp_*` (Chrome), jamais mélangés ; contenu et usage de chaque suite : tableau « Suites nommées »
(§ 1).

```
Les tests modifient l'état ?
  ├── oui et reset bon marché (terminateApp) → beforeEach
  └── non ou reset coûteux (login OIDC)     → before + cleanup explicite (after)
```

- **`before`** : navigation coûteuse faite une seule fois (onboarding, login OIDC ~30 s). Convient si les tests ne modifient pas l'état global, ou si un test qui échoue ne pollue pas les suivants.
- **`beforeEach`** : reset strict avant chaque test. Convient dès qu'un test modifie l'état de l'app, ou que l'onboarding doit être rejoué. `driver.reset()` est **déprécié** dans Appium 3 — utiliser
  `terminateApp` + `activateApp` (conserve l'installation, reset l'état mémoire) ou `fullReset: true`
  en capability pour une réinstallation complète.
- **Indépendance des `it()` : règle absolue.** Chaque `it()` doit pouvoir s'exécuter dans n'importe quel ordre et en isolation. Un `it()` qui modifie l'état doit le remettre dans l'état initial (dans le test lui-même, ou dans
  `afterEach`).
- **Exception documentée : cycle de vie d'une entité backend.** Quand des `it()` testent les états successifs d'une même entité côté API (`new → wip → closed`), la dépendance entre `it()` est structurelle. Dans ce cas : documenter explicitement la dépendance en commentaire du `describe` ; utiliser un identifiant unique horodaté ; chaque `it()`
  publie ses propres notifications et valide son état sans supposer l'état *local de l'app* laissé par le `it()`
  précédent ; vérifier que
  `specFileRetries` rejoue bien tout le fichier (nouvelle session → `before` rejoué), pas un `it()`
  isolé.
- **Un test ne fait jamais `xcrun simctl` ni `adb` directement.** Il s'appuie sur l'environnement préparé avant le run
  (émulateur/simulateur démarré par `just start-android` / `just start-ios`, app installée par Appium à partir de `ANDROID_APP_PATH` / `IOS_APP_PATH` ; côté Android, `onPrepare` de `wdio.android.conf.ts` remet l'état à zéro). Ça garantit la portabilité (CI, machines différentes) et centralise la chaîne de préparation dans les configs WDIO et le `justfile`.
- **Idempotence backend** : un test qui publie des données (notification, post) doit utiliser un identifiant/titre unique horodaté (`` `AMI-vanilla-${Date.now()}` ``) — sinon un backend qui fait un
  `get_or_create` sur le payload retourne le record d'un run précédent au lieu d'en créer un nouveau.

---

## 7. Stratégies de retry

Trois niveaux, à ne pas confondre :

| Niveau          | Mécanisme               | Session Appium              | Quand l'utiliser                               |
|-----------------|-------------------------|-----------------------------|------------------------------------------------|
| **Spec**        | `specFileRetries`       | Fraîche (nouveau processus) | Instabilité environnement (simulateur, réseau) |
| **Applicatif**  | Retry dans le code      | Conservée                   | API tiers cold-start (5xx transitoires)        |
| **Page Object** | `try/catch` dans le POM | Conservée                   | Élément instable post-redirect                 |

- **Éviter `mochaOpts.retries`.** Il relance le `it()` dans la **même** session Appium : l'état de l'app peut être corrompu (onboarding à moitié passé, token expiré), les logs Appium du premier essai restent dans le même flux (impossible de distinguer les tentatives), et un bug réel qui passe au 2e essai devient invisible. `specFileRetries`
  relance le fichier entier dans un nouveau processus avec une session fraîche et des logs propres par tentative.
- **Retry applicatif** (backend cold-start type Scalingo/Heroku) : retry sur 5xx uniquement, jamais sur 4xx (erreur client, non transitoire).
- **Retry court en Page Object** (élément instable qui réapparaît brièvement, ex. bouton FranceConnect en fin de redirect OIDC) : le `catch` best-effort **ne doit jamais être totalement silencieux** — logger avec `log.warn()` (voir §1, jamais `console.warn`) conditionné au cas attendu documenté. Un
  `catch {}` vide masque un vrai bug (sélecteur cassé, timeout réseau) derrière un « comportement normal ».
- **Ne pas retrier les aides `spa.ts`** — elles intègrent déjà une attente interne (`timeout`). Augmenter ce timeout plutôt que d'enrouler l'appel dans une boucle de retry manuelle.

- **Ne pas corriger chaque échec temporaire.** Un échec isolé dû à l'infrastructure (bac à sable FranceConnect, émulateur, réseau) ou à un parcours différent parce qu'une session/des cookies traînent d'un tir sur l'autre ne justifie pas un correctif de code. Corriger sur récurrence mesurée (campagne de stabilité), avec une cause établie.

**Valeur de `specFileRetries`** (`wdio.base.conf.ts`, fonction `specFileRetriesFromEnv`) : **0 par défaut et pour toute mesure** (poste local, débogage, campagnes de stabilité : on voit la vraie cause, pas le retry qui la masque) ; **1 dans un job de CI** (GitHub Actions pose `CI=true` et `GITHUB_ACTIONS=true`, hérités par les recettes `just`). Pour forcer : `WDIO_SPEC_FILE_RETRIES=N` (entier) ou `--specFileRetries=N` en ligne de commande, qui l'emporte sur la config. Indice de lecture en CI : un échec rejoué à l'identique = bug reproductible ; un échec qui passe au 2e essai = test instable (la trace du premier essai est conservée).

---

## 8. Erreurs de test vs erreurs techniques

Deux catégories d'échec, à ne jamais mélanger dans le type d'exception levée :

| Catégorie            | Signification                                                                                                           | Type levé                                                                                                                                                         |
|----------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Erreur de test**   | L'application n'a pas fait ce qu'on attendait d'elle (le test s'est exécuté correctement, le résultat observé est faux) | Librairie d'assertion (`expect(...).toXxx()`) ou, hors contexte `expect-webdriverio` (boucle de polling manuelle, réponse HTTP), `AssertionError` (`node:assert`) |
| **Erreur technique** | Le test n'a pas pu s'exécuter (infra, environnement, configuration — rien à voir avec le comportement de l'application) | `Error`                                                                                                                                                           |

- **Pourquoi la distinction compte** : le type de l'exception (`AssertionError` ou `Error`) dit s'il faut suivre un bug
  applicatif (`AssertionError`, ou un matcher `expect`) ou réparer le test ou l'environnement (`Error`), pas l'application.
  Lever le bon type au bon endroit rend le rapport et le dump d'échec directement actionnables.
- **`expect(...).toXxx()` reste le premier choix** dès qu'un matcher `expect-webdriverio` existe pour le cas — il lève déjà le bon type en interne. `AssertionError` explicite est réservé aux échecs métier qui ne passent pas par un
  `expect()` : sortie d'une boucle de backoff (`waitForDemarche`,
  `assertNotificationReceived`), réponse HTTP inattendue d'une API partenaire (`publishEvent`), élément de confirmation attendu absent.
- **`throw new Error(...)` reste réservé au technique** : contexte `WEBVIEW_*` introuvable (`platform().inWebContext()`), variable d'environnement manquante (`requireEnv`) — un humain doit corriger la configuration ou l'environnement, pas relire le comportement de l'app.

```typescript
import {AssertionError} from 'node:assert'

// ✅ Erreur de test — l'API partenaire a répondu, mais avec un statut d'échec après épuisement des
// retries applicatifs (cf. §7) : ça révèle un vrai problème d'application/API, pas un test cassé.
lastError = new AssertionError({message: `PUT /api/v2/event → HTTP ${response.status}: ${text}`})

// ✅ Erreur technique — rien à voir avec l'application : la WebView n'existe pas, il faut corriger
// les capabilities Appium ou l'environnement, pas enquêter sur un comportement métier.
throw new Error(
    `Aucun contexte WEBVIEW_* trouvé après ${WEBVIEW_WAIT_MS}ms. Contextes disponibles : [${contexts.join(', ')}]. ` +
    'Vérifier appium:chromedriverAutodownload (Android) ou isInspectable=true (iOS).'
)
```

---

## 9. Rapports et dumps d'échec

Allure a été retiré (2026-10-08). Ce qui reste :

- **`step('…')`** (`src/helpers/reporting/report.ts`) pour découper un scénario long en étapes métier : l'étape est journalisée et mémorisée, puis écrite dans le dump d'un test en échec (« où le scénario s'est arrêté »). Les annotations `feature` / `severity` / `epic` / `story` / `tag` d'Allure n'existent plus : les titres de `describe` et de `it` portent la fonctionnalité.
- **Résumé passants/cassés** : reporter JUnit, **un seul rapport par run** : `test-results/junit/results-<horodatage>_<plateforme>_<suite ou spec>.xml`, avec un `<testsuite>` par fichier de spec (nommé comme lui, ex. `authentification.smoke.test.ts`), un `<testcase>` par `it()` et `classname` = le fichier de spec (le titre du `describe` reste en propriété `suiteName`). Le reporter écrit un fichier par worker ; `onComplete` les fusionne (`src/helpers/reporting/junit-clean.ts`) et ajoute à chaque `<testcase>` des `<property>` (`src/helpers/reporting/junit-join.ts`) : `platform`, `ami_env`, `outcome` (`passed`, `failed`, `skipped`, `flaky` = réussi à la relance de `specFileRetries` après un échec), `attempt`/`attempts` si le test a été rejoué et, pour un échec relié à son dump (jointure par titre assaini comme le fait le reporter, `normalizeTitle()`), `dump_path` (relatif à `test-results/`), `context_kind` (`web` ou `native`) et `sentry_url` (contexte web seulement : pas de lien pour un écran natif). En CI, un artefact par plateforme (`test-results-<dépôt>-pr<N>-<plateforme>-run<N>`), un check « e2e (ami-system-tests) » (`mikepenz/action-junit-report`) et UN commentaire de PR (tableau test | résultat | durée | lien Sentry, échecs en premier, mis à jour par marqueur HTML) produit par `.github/scripts/e2e-comment.mjs` via l'action `.github/actions/e2e-pr-comment` (appelée par le job `report` de `workflow-e2e-main.yml`) ; noms de tests et messages y sont échappés (ils viennent d'un code modifiable dans une PR). Tests : `npm run test:unit` (jointure, JUnit réels lus en lecture seule via `AMI_JUNIT_ROOT`) et `npm run test:unit:ci` (script de commentaire). Les jobs de CI restent verts même si des tests échouent : le résultat se lit dans le check et le commentaire. Le script de rapport s'exécute avec `pull-requests: write` depuis la ref `checkout_ref` : elle doit rester une branche de confiance d'ami-system-tests. iOS n'est pas développé en CI : `run_ios` reste un point d'extension inactif de `workflow-e2e-main.yml`.

**Découpage par déclencheur** (API `workflow-e2e-trigger-after-deploy.yml`, app Android `workflow-e2e-trigger.yml`) :

| Déclencheur | Webapp | Android | Appareil | APK |
|---|---|---|---|---|
| PR (API) | `webapp_usage` | `mobile_all`, un seul passage | ancien `pixel_2_api30` | dernier tag d'ami-app-android |
| merge (API) | `webapp_usage` | `mobile_all`, un seul passage | récent `pixel_8_api36` | dernier tag d'ami-app-android |
| tag (API) | `webapp_usage` | `mobile_all`, un seul passage | ancien `pixel_2_api30` (hypothèse : la demande ne précisait pas l'appareil) | dernier tag d'ami-app-android |
| PR (app Android) | — | `mobile_all`, un seul passage | ancien `pixel_2_api30` | celui que la PR construit |
| merge (app Android) | — | `mobile_all`, un seul passage | récent `pixel_8_api36` | celui que le merge construit |
| tag (app Android) | — | `mobile_all` | ancien `pixel_2_api30` | construit + publié (`app-staging-debug-<tag>`) |
| manuel (`workflow_dispatch`, les deux dépôts) | `webapp_short` | `mobile_short` | `pixel_2_api30` (API) / `pixel_8_api36` (app Android) | choix libre de toute suite (mise au point de la CI) |
| hors CI : valider un déploiement | `webapp_smoke` | `mobile_smoke` | au choix | `just test-webci --suite …` / `just test-android --suite …` |
| hors CI : tester un déploiement | `webapp_all` | `mobile_all` | au choix | idem |

**Secrets et variables GitHub** à créer dans le dépôt appelant (transmis par `secrets: inherit` ; jamais de valeur dans le code) : `NOTIF_PARTNER_ID` et `NOTIF_PARTNER_SECRET` (partenaire AMI), `NOTIF_PARTNER_DINUM_DN_ID` et `NOTIF_PARTNER_DINUM_DN_SECRET` (partenaire `dinum-dn`, consentement activé : scénarios S5, S5.2 et S6.3 de la webapp, SKIPPÉS « BLOQUÉ » s'ils sont absents ; inutiles dans `ami-app-android`, dont les tests mobiles n'utilisent que le partenaire AMI), `WEB_APP_ACCESS_KEYS`, et pour l'APK du dernier tag la variable `AMI_REVIEWAPPS_APP_ID` + le secret `AMI_REVIEWAPPS_PRIVATE_KEY`.

**APK du dernier tag (API)** : `apk_source: latest-tag` de `workflow-e2e-main.yml` retrouve le dernier artefact `app-staging-debug-<tag>` non expiré d'ami-app-android (rétention 90 jours, dépôt privé). Il faut un jeton d'installation de la GitHub App `ami-reviewapps` (déjà utilisée par le backend : `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` côté Scalingo, hors GitHub Actions), généré par `actions/create-github-app-token` limité à `ami-app-android` et `actions: read`. À créer dans le dépôt de l'API (valeurs fournies par l'équipe, jamais dans le code) : variable `AMI_REVIEWAPPS_APP_ID` et secret `AMI_REVIEWAPPS_PRIVATE_KEY` (PEM brut ; le secret Scalingo est en base64, et GitHub interdit les noms commençant par `GITHUB_`). Noms proposés, à valider.

Texte prêt à coller pour la demande administrative :

> Demande : autoriser la GitHub App `ami-reviewapps` à lire les artefacts de workflow du dépôt `numerique-gouv/ami-app-android`. Installation : ajouter `ami-app-android` aux dépôts de l'installation de l'App sur l'organisation. Permission minimale : Repository permissions, Actions : Read-only (Metadata : Read-only, implicite) ; aucune permission en écriture. Raison : la CI de `ami-notifications-api` télécharge l'APK du dernier tag publié par le job `publish-version` de `ami-app-android` (artefact privé `app-staging-debug-<tag>`) pour lancer les tests Android de non-régression sans le reconstruire. Le jeton est généré à chaque run, limité à ce dépôt et à `actions: read`, et expire en fin de job. Le `<system-out>` de chaque test contient la console du scénario (logs `-> it`, appels de Page Objects, `step`, avertissements) ; les lignes brutes `COMMAND`/`RESULT` du reporter en sont retirées (`src/helpers/reporting/junit-clean.ts`) : les commandes WebDriver restent dans `.wdio-logs/`.
- **Contexte d'un test en échec** (`src/helpers/reporting/failure-dump.ts`, appelé par le hook `afterTest`) dans `test-results/traces/<run>/failures/<test>__<horodatage>/context.json` (même dossier de run que les traces) : test, étapes, erreur, plateforme, appareil, backend, URL aux jetons masqués, horodatage UTC, identifiants Sentry de la SPA et lien vers la trace Sentry. Lister les échecs : `just failures-text`.
- **Trace d'un test en échec** (service DevTools, mode trace, cf. `traceServices` dans `wdio.base.conf.ts`) : `test-results/traces/<horodatage>_<plateforme>_<suite ou spec>/test-results/` — un dossier par run, donc deux runs du même test ne s'écrasent pas (`src/helpers/reporting/run-dir.ts`) — qui contient `<spec>_test-<test>-…/trace/` (`transcript.md` à lire en premier, captures, arbre de l'écran et éléments avec leurs locators, réseau aux cookies et jetons masqués par `src/helpers/reporting/trace-redact.ts`), la capture `screenshot-<test>-….png` et l'index `devtools-artifacts-*.json` (test, état, chemin de la trace). L'ouvrir : `just failures-ui`.
- **Page lourde sur iOS** : en contexte natif, le service DevTools demande à Appium, après chaque action, l'arbre d'accessibilité natif de toute l'app (WDA `/source`). Sur une page qui en compte des centaines d'éléments (l'inbox du compte de test), il ne revient pas en ~2 min et bloque la file de commandes d'Appium (timeout Mocha de 120 s). Parade : rester **dans la WebView** pendant tout l'épisode concerné (un seul `platform().inWebContext(…)` autour des étapes du scénario, cf. `src/tests/mobile/notifications.usage.test.ts`) ; la trace est alors conservée, le service lit le DOM. Un journal Appium en `debug` (`logLevel` du service Appium de `wdio.ios.conf.ts`, à ne pas commiter) montre le blocage : `Scheduling the 'execute' command … 1 queue item is already waiting`.
- **Sentry** : on journalise le trace id et le dernier identifiant d'événement lus dans la SPA (`src/helpers/reporting/sentry.ts`). Le trace id change à chaque chargement de page et `lastEventId` vaut `null` sans erreur capturée ; les apps natives n'ont pas d'intégration Sentry.
- **Ne jamais écrire de secret ni de jeton** dans un dump ou un log : les URL passent par `maskSensitiveUrl` (`src/helpers/common/session.ts`).

La configuration des reporters est commentée dans `wdio.base.conf.ts`.

---

## 10. Règles de débogage

- **Observer avant d'écrire un sélecteur** — inspecter l'écran réel (`just explore-webapp|android|ios` puis `just s <cible> snapshot -i`) plutôt que deviner un sélecteur « qui devrait marcher ».
- **Ne jamais commiter un locator ou un workaround qui n'a pas été validé** en exécution réelle. Un commit de workaround hypothétique casse silencieusement un autre cas. Tester d'abord, puis commiter avec un message qui décrit le **pourquoi** (bug WKRDP, AX tree périmé, etc.), pas seulement le *quoi*.
- **Toggles de debug** (`logLevel: 'info'`) : tolérés commités tant que la suite est en développement actif, pour faciliter le diagnostic quotidien. `wdio.base.conf.ts` est aujourd'hui à
  `logLevel: 'warn'`. `specFileRetries` n'est plus un toggle à éditer : 0 en local, 1 en CI, piloté par l'environnement (cf. §7).
- Avant toute session de débogage approfondie, regarder les dumps d'échec (`just failures-text`) et les logs Appium (`.wdio-logs/`) — souvent suffisant pour identifier la commande qui a échoué sans avoir à relancer en `logLevel: 'debug'`.

La boucle d'exploration (`wdio session` : `just explore-webapp|android|ios`, `just s`, `just webview`, `just explore-export`, `just debug-webapp`) et le détail des commandes `just` sont documentés dans le [README](README.md#explorer-et-déboguer-avec-wdio-session-webdriverio-10).
