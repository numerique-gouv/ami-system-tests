#import "@preview/touying:0.6.3": *
#import themes.simple: *

#show: simple-theme.with(
  aspect-ratio: "16-9",
)

#slide[
  #align(center + horizon)[
    #text(size: 2em, weight: "bold")[Tests E2E mobiles pour AMI]
    #v(0.5em)
    #text(size: 1.3em)[Compte rendu comparatif]
    #v(1.2em)
    #text(size: 1em)[Nicolas Fedou — PermaSoft / DINUM]
    #v(0.2em)
    #text(size: 0.9em, fill: luma(100))[Juin 2026]
  ]
]

// ═══════════════════════════════════════════════════════════════
// Section 1 — Familles d'outils
// ═══════════════════════════════════════════════════════════════

= Familles d'outils

== Contexte de l'évaluation

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *L'application AMI* — app hybride iOS + Android :
    - Couche *native* (SwiftUI / Jetpack Compose)
    - WebViews SPA Svelte (auth FranceConnect, inbox notifications)
    - Flux OIDC via SFSafariViewController (iOS)

    #v(0.8em)
    *Scénarios complexes à couvrir*
    - App hybride native ↔ WebView
    - Pages web compatibles N-1 / N-2 native
    - Multi-appareils (état partagé entre devices)
  ],
  [
    *Critère principal d'évaluation*

    #v(0.5em)
    #align(center)[
      #rect(fill: luma(230), inset: 1em, radius: 4pt)[
        #text(size: 1.15em, weight: "bold")[
          Maintenabilité\
          face aux cas complexes
        ]
      ]
    ]

    #v(0.8em)
    Pas seulement "ça marche" :\
    combien de code faut-il maintenir\
    quand l'app évolue ?
  ],
)

== Vue d'ensemble des trois frameworks

#v(0.5em)
#set text(size: 0.88em)
#table(
  columns: (1.6fr, 1.3fr, 1.5fr, 2.2fr),
  align: (left, center, center, left),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Framework*], [*Style*], [*Mobile natif*], [*Maturité — Juin 2026*],
  [*Playwright*],   [Impératif (TS/JS)], [Indirect],              [Mature côté web — immature côté mobile],
  [*Maestro*],      [Déclaratif (YAML)], [Natif iOS + Android],   [Stable — WebView en bêta (05/2026)],
  [*WebdriverIO*],  [Impératif (TS/JS)], [Natif via Appium],      [Très mature — écosystème Node riche],
)
#set text(size: 1em)

// ═══════════════════════════════════════════════════════════════
// Section 2 — Playwright
// ═══════════════════════════════════════════════════════════════

= Playwright

== Playwright ne gère pas le mobile natif

`playwright/README.md` : _"La stack playwright ne gère pas les app mobiles nativement."_ — 4 alternatives évaluées :

#v(0.3em)
#set text(size: 0.74em)
#table(
  columns: (1.5fr, 1.2fr, 0.55fr, 2.75fr),
  align: (left, left, center, left),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Approche*], [*En bref*], [*Statut*], [*Commentaire*],
  [Playwright Android API], [Natif Playwright], [❌], [WebViews Android uniquement — pas d'iOS, pas d'éléments natifs],
  [Appwright (empirical.run)], [Le plus ancien], [⚠️], [Gelé depuis 16/12/2024 — PRs de dépendances encore en attente en 2025],
  [*Mobilewright* (mobile-next)], [Le plus récent], [🔬], [1er commit 03/2026, plusieurs releases/semaine — trop immature aujourd'hui],
  [Playwright runner + WebdriverIO], [L'hybride], [➖], [Deux couches distinctes — peu élégant, aucun avantage réel],
)
#set text(size: 1em)

== Mobilewright — Prometteur, mais trop tôt (juin 2026)

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *Pourquoi c'est prometteur*

    - Drivers natifs *sans Appium* — pile propre
    - API très proche de Playwright web :\
      `screen.getByRole('button').tap()`
    - IA-friendly, OSS, très actif
    - Inspiré des retours d'expérience\
      de Playwright côté web

    #v(0.5em)
    `github.com/mobile-next/mobilewright`
  ],
  [
    *Pourquoi c'est trop tôt*

    - 1er commit : *mars 2026* — 3 mois d'existence
    - Plusieurs releases par semaine → instable
    - Écosystème quasi-inexistant
    - Aucune référence en production
    - Pas de support iOS mature

    #v(0.5em)
    #rect(fill: luma(235), inset: 0.8em, radius: 4pt, width: 100%)[
      *À re-évaluer dans 6–12 mois.*\
      Ce sera peut-être la prochaine\
      meilleure solution mobile.
    ]
  ],
)

// ═══════════════════════════════════════════════════════════════
// Section 3 — Maestro
// ═══════════════════════════════════════════════════════════════

= Maestro

== Maestro — Limitations connues, toutes solvables

*Le README Maestro est une liste de limitations... et de leurs solutions.*

#v(0.5em)
#table(
  columns: (2fr, 0.9fr, 2.5fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Limitation*], [*Statut*], [*Solution*],
  [YAML ne couvre pas tous les cas], [✅ Résolu], [`runScript` → JS dans GraalVM (sans libs Node tierces)],
  [Vendor lock (Maestro Cloud only)], [✅ Solvable], [`maestro-runner` OSS → TestingBot, SauceLabs],
  [Contraintes de développement], [✅ Documenté], [3 guidelines dans le repo (WebView, unicode, port 7001)],
)

#v(0.8em)
*3 guidelines* dans `maestro/guidelines/` = post-mortems capturés dans le code :\
preuve d'un processus de mise au point mûr, pas juste d'un framework stable.

== Avantage 1 — Le déclaratif : tests qui lisent comme des checklists

#grid(
  columns: (1fr, 1fr),
  gutter: 1.5em,
  [
    #text(size: 0.64em, raw(read("assets/maestro-vanilla.yaml"), lang: "yaml"))
  ],
  [
    *Ce que ce YAML représente*

    Un scénario E2E complet en 28 lignes :

    + Lancement propre (`clearState`)
    + Login FranceConnect (sandbox)
    + Onboarding décliné
    + WebView SPA attendue
    + Inbox in-app ouverte
    + Titre courant mémorisé
    + Notification publiée via API
    + Refresh + assertion

    #v(0.5em)
    Pas de `driver`, pas de `class`,\
    pas d'`import` — juste la *logique métier*.
  ],
)

== Avantage 2 — Moins buggué : le refresh AX implicite

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *Le problème WebView iOS — WDIO*

    Après une redirection OIDC (HTTP 302), le snapshot d'accessibilité WKWebView reste actif. `isDisplayed()` retourne `false` même si l'élément est visuellement présent.

    #v(0.5em)
    Solution à coder côté WDIO :
    ```typescript
    // Forcer un refresh de l'AX tree
    await driver.getPageSource()
    // ou : switch context NATIVE ↔ WEBVIEW
    // ou : driver.takeScreenshot()
    ```
    Coût : 2–10 s à chaque transition de page.
  ],
  [
    *Comment Maestro évite ce problème*

    Maestro effectue un `inspect` (équivalent screenshot) *avant chaque commande*. Cela force un refresh de l'AX tree WKWebView à chaque step — gratuitement.

    #v(0.5em)
    Solution Android :
    ```yaml
    androidWebViewHierarchy: devtools
    ```
    Chrome DevTools Protocol → arbre DOM complet et synchrone.

    #v(0.5em)
    #rect(fill: luma(235), inset: 0.6em, radius: 4pt)[
      *Limite iOS* : pas encore d'équivalent `devtools` — WebView en bêta (05/2026).\
      Maestro reste meilleur que WDIO\
      grâce au refresh implicite.
    ]
  ],
)

== Processus — Amorcer un test au milieu d'un flow

#grid(
  columns: (1fr, 1fr),
  gutter: 1.5em,
  [
    *Le subflow d'amorçage* (`_launch.yaml`)
    #text(size: 0.65em, raw(read("assets/maestro-launch.yaml"), lang: "yaml"))

    #v(0.3em)
    *Chaîne typique pour tester l'inbox :*
    #text(size: 0.72em)[
      ```yaml
      - runFlow: subflows/_launch.yaml
      - runFlow: subflows/auth/login.yaml
      - runFlow: subflows/onboarding/dismiss.yaml
      - runFlow: subflows/webview/wait-loaded.yaml
      # ↑ 4 lignes → utilisateur authent. sur la home
      ```
    ]
  ],
  [
    *Pourquoi c'est puissant*

    - `optional: true` → le subflow est un *no-op* si sa condition n'est pas remplie
    - `when: visible:` → exécution conditionnelle sans `if/else` impératif
    - On peut démarrer au *milieu d'un flow long* en composant juste les bons amorces

    #v(0.5em)
    *Idempotence gratuite* : le même subflow peut être appelé plusieurs fois sans effet de bord. Pas de "déjà fait ?" à gérer.

    #v(0.5em)
    *Comparer avec WDIO* : même principe (`beforeAll`, login fixture), mais à écrire manuellement en TypeScript.
  ],
)

== Processus — Inspection et itération interactive

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *1. Maestro Studio*\
    Interface GUI live — piloter l'écran, voir l'arbre d'accessibilité en direct, enregistrer des actions.
    ```bash
    just studio   # → maestro studio
    ```

    #v(0.3em)
    *2. `maestro hierarchy` + filtre jq*\
    Retourne uniquement les sélecteurs utilisables : `label`, `text`, `id`, `hint`. Copier-coller direct dans le YAML.
    ```bash
    just hierarchy
    # label: "franceConnect button"
    # text: "Se connecter"
    # id: "splash_screen"
    ```
  ],
  [
    *3. Mode `--watch` (TDD Maestro)*\
    Relance automatiquement le flow à chaque sauvegarde du YAML :
    ```bash
    just watch flows/notifications/...yaml
    ```

    #v(0.3em)
    Boucle : éditer → sauvegarder → résultat sur le device → recommencer.

    #v(0.5em)
    *Artefacts post-run :*
    - `commands-*.json` — trace structurée de chaque commande (COMPLETED / FAILED / SKIPPED)
    - Screenshot `❌-<timestamp>.png` automatique sur erreur

    #v(0.3em)
    *Tag `wip`* → flows en cours exclus de la CI (`config.yaml: excludeTags`).
  ],
)

== Processus — Boucle de mise au point (MCP + Maestro)

*Workflow itératif — ancré dans l'observation, jamais dans l'hypothèse :*

#v(0.5em)
#set text(size: 0.84em)
#table(
  columns: (0.4fr, 1.5fr, 2.7fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [\#], [*Outil*], [*Action*],
  [1], [`just android-start`], [Démarrer le simulateur/émulateur — préalable à toute commande MCP],
  [2], [`list_devices` (MCP)], [Récupérer le `device_id` du device booté],
  [3], [`inspect_screen` + `take_screenshot`], [Cartographier l'écran courant — identifier les sélecteurs réels],
  [4], [`run` YAML inline (MCP)], [Tester 1–2 commandes (`tapOn`, `extendedWaitUntil`) ciblées],
  [5], [Éditeur (subflow)], [Si OK : consigner dans le subflow `.yaml` avec un commentaire explicatif],
  [6], [Boucle], [Si KO : ré-inspecter, ajuster le sélecteur ou le timing, relancer l'étape 4],
)
#set text(size: 1em)

// ═══════════════════════════════════════════════════════════════
// Section 4 — WebdriverIO
// ═══════════════════════════════════════════════════════════════

= WebdriverIO

== WebdriverIO — Un écosystème mature

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *La pile technique*

    - WebdriverIO 9.27 + Appium 3.5
    - `appium-uiautomator2-driver` (Android)
    - `appium-xcuitest-driver` (iOS)
    - `@testing-library/webdriverio` 3.2
    - TypeScript 6 strict + ESLint
    - Reporters : spec, Allure (prêt), JUnit

    #v(0.5em)
    ~350 dépendances vs *1 binaire Maestro*.\
    L'écosystème Node complet est disponible.

    #v(0.5em)
    Hooks WDIO riches : `beforeSession`, `afterTest` (screenshot auto sur échec), `specFileRetries` (relance dans une session Appium fraîche).
  ],
  [
    *Séparation à 3 niveaux*

    ```
    test (scénario utilisateur)
      └── Page Object (action métier)
            └── tl().getByRole()
                (sélecteur sémantique ARIA)
    ```

    - `src/tests/*.test.ts` — scénarios Mocha BDD
    - `src/pages/*.page.ts` — actions métier, *sans sélecteurs*
    - `src/pages/locators/*.locators.ts` — sélecteurs par plateforme

    #v(0.5em)
    Deux sélecteurs par composant :
    - `androidXxxLocators` (UiAutomator2 resource-id)
    - `iosXxxLocators` (accessibility id XCUITest)
    - `getXxxLocators()` → retourne le bon selon `driver.isIOS`
  ],
)

== WebdriverIO — Le test et le Page Object

#grid(
  columns: (1fr, 1fr),
  gutter: 1.5em,
  [
    *`notifications.test.ts`*
    #text(size: 0.6em, raw(read("assets/wdio-test.ts"), lang: "typescript"))
  ],
  [
    *`notifications.page.ts`* (extraits)
    #text(size: 0.6em, raw(read("assets/wdio-page.ts"), lang: "typescript"))
  ],
)

== WebdriverIO — Un niveau d'abstraction qui ralentit

*Ce qu'on doit coder à la main (et que Maestro fait gratuitement) :*

#v(0.3em)
#set text(size: 0.8em)
#table(
  columns: (1.3fr, 2fr, 1.5fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Point dur*], [*Code WDIO nécessaire*], [*Maestro*],
  [Bascule WebView], [`withWebView(async () => { ... })`], [Implicite],
  [AX tree périmé iOS], [`await driver.getPageSource()` avant chaque assertion], [Refresh avant chaque cmd],
  [Android WebView], [`chromedriverAutodownload: true` (sinon échec silencieux)], [`devtools` dans header YAML],
  [iOS SFSafariViewController], [Reset cookies + WKWebView container via `xcrun simctl` dans justfile], [`when: visible:` + `extendedWaitUntil`],
  [Cross-plateforme], [`androidXxx` / `iosXxx` + `getXxxLocators()` selon `driver.isIOS`], [Dispatcher `when: platform:` YAML],
)
#set text(size: 1em)

== WebdriverIO — Processus de mise au point

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *Ce qui existe*

    - `just test-android Notifications` → filtre Mocha par nom (grep)
    - `just test-android-fast` → skip rebuild
    - `specFileRetries: 1` → relance dans une session Appium fraîche
    - Screenshots automatiques `afterTest` en cas d'échec

    #v(0.5em)
    *Ce qui est disponible mais inexploité*

    - `browser.debug()` → *REPL Node interactif* qui fige le test — `$('selector').click()` à la main, puis `.exit`
    - `wdio repl` → session Appium sans test
    - Watch mode WDIO (`--watch`)
    - Appium Inspector (GUI externe)
  ],
  [
    *La boucle aujourd'hui*

    ```
    just test-ios-fast Notifications
       ↓ (échec)
    lire screenshot dans .wdio-logs/
       ↓
    ajuster sélecteur / timing
       ↓
    relancer
    ```

    #v(0.5em)
    *Comparer avec Maestro Studio :*\
    Maestro pilote l'écran *en direct*, sans relancer de test.

    `browser.debug()` offrirait la même ergonomie côté WDIO — mais il n'est pas encore intégré dans le workflow de ce projet.
  ],
)

== WebdriverIO — Screenplay : la prochaine étape possible

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *4 concepts du Screenplay Pattern*

    #set text(size: 0.82em)
    #table(
      columns: (1fr, 1fr, 2fr),
      stroke: 0.5pt,
      fill: (x, y) => if y == 0 { luma(210) } else { none },
      [*Concept*], [*Rôle*], [*Exemple*],
      [Actor],    [Qui agit],         [`Actor.named('Alice')`],
      [Ability],  [Ce qu'il peut],    [`BrowseTheWebWithWebdriverIO`],
      [Task],     [Ce qu'il fait],    [`LoginViaFranceConnect()`],
      [Question], [Ce qu'il observe], [`TopNotificationTitle()`],
    )
    #set text(size: 1em)

    #v(0.3em)
    Librairie : `@serenity-js/webdriverio`
  ],
  [
    *Ce que ça donne*

    ```typescript
    await alice.attemptsTo(
      LoginViaFranceConnect(),
      Dismiss(onboardingNotifications),
      Open(notificationsInbox),
    )
    expect(await alice.asks(
      TopNotificationTitle()
    )).not.toEqual(oldTitle)
    ```

    #v(0.5em)
    *Quand migrer ?*\
    > 15–20 scénarios, équipe QA non-dev,\
    copier-coller difficile à maintenir.

    #v(0.3em)
    *Verdict README WDIO* :\
    "POM + Testing Library est le bon\
    niveau aujourd'hui."
  ],
)

// ═══════════════════════════════════════════════════════════════
// Section 5 — Comparatif
// ═══════════════════════════════════════════════════════════════

= Comparatif Maestro vs WebdriverIO

== Tableau récapitulatif

#v(0.3em)
#set text(size: 0.77em)
#table(
  columns: (1.8fr, 2.5fr, 2.5fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Aspect*], [*Maestro*], [*WebdriverIO*],
  [Format],           [YAML — ~30 lignes / scénario E2E],     [TypeScript — classes, driver, imports],
  [Composition],      [`runFlow` + `env:` (déclaratif)],      [Imports + appels de fonctions],
  [Conditions],       [`when: visible:` / `optional: true`],  [`if (await el.isDisplayed())`],
  [État zéro],        [`clearState` + `clearKeychain: true`], [Manuel via capabilities + justfile],
  [Cross-plateforme], [Dispatcher `when: platform:` YAML],    [Runners séparés — capabilities distinctes],
  [Itération],        [`--watch`, `studio`, `hierarchy`],     [grep + skip-rebuild — `browser.debug()` inexploité],
  [Échappatoire],     [`runScript` (GraalVM — sans libs Node)],[TS natif, Node complet],
  [WebView iOS],      [Refresh AX *implicite* avant chaque cmd],[`refreshAxTree()` helper manuel],
  [Écosystème],       [1 binaire — mono-outil],               [350+ dépendances — reporters, plugins, CI],
  [Scénario vanilla], [1 flow + 5 subflows + 2 elements + 1 script],[1 test + 1 page + 1 locator + 1 helper],
)
#set text(size: 1em)

== Verdict

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *Maestro gagne pour AMI aujourd'hui*

    - App hybride WebView → refresh AX implicite = moins de flakiness iOS
    - < 20 scénarios → la composition YAML suffit
    - Équipe orientée déclaratif → lisibilité métier directe
    - Mise au point interactive (`studio` + `--watch` + `hierarchy`)
    - Le déclaratif force à documenter les invariants (subflows commentés)

    #v(0.5em)
    #rect(fill: luma(220), inset: 0.8em, radius: 4pt, width: 100%)[
      *Maestro est plus efficace\
      pour ce profil de projet.*
    ]
  ],
  [
    *WebdriverIO reste pertinent quand...*

    - Besoin de librairies Node (HTTP custom, crypto, base de test)
    - Parallélisme inter-devices complexe (Appium Hub/Grid)
    - Intégrations CI riches (JUnit, Allure, JIRA)
    - Suite de > 20 scénarios avec retry sophistiqué
    - Forte culture TypeScript dans l'équipe

    #v(0.5em)
    L'architecture POM + Testing Library est solide. Le Screenplay Pattern reste une évolution naturelle si la suite grossit significativement.
  ],
)

== À surveiller

#v(0.3em)
#set text(size: 0.84em)
#table(
  columns: (2fr, 1fr, 2.5fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Évolution*], [*Horizon*], [*Impact*],
  [Mobilewright sort de la phase expérimentale], [6–12 mois], [Réévaluer Playwright comme alternative principale mobile],
  [WebView Maestro sort de la bêta], [2026 H2], [Maestro devient pleinement fiable sur iOS WebView],
  [Maestro : `maestro-runner` + TestingBot], [Disponible dès maintenant], [Sortie du vendor lock Maestro Cloud],
  [`browser.debug()` intégré dans le workflow WDIO], [À tout moment], [Réduire l'écart d'ergonomie avec Maestro Studio],
  [Screenplay si la suite dépasse 20 scénarios], [Selon croissance], [Améliorer lisibilité métier côté WDIO],
)
#set text(size: 1em)

// ═══════════════════════════════════════════════════════════════
// Section 6 — Annexes
// ═══════════════════════════════════════════════════════════════

= Annexes

== Pré-requis et points d'entrée

#grid(
  columns: (1fr, 1fr),
  gutter: 2em,
  [
    *Outils requis (vérifié par `just check`)*

    - `just` — orchestrateur de commandes
    - `adb` + Android SDK
    - Xcode + `xcodegen`
    - `node` ≥ 20
    - `appium` global (`npm i -g appium`)
    - `maestro` CLI

    #v(0.5em)
    *Lancer les tests*
    ```bash
    cd maestro    && just test-android
    cd maestro    && just test-ios
    cd webdriverio && just test-android
    cd webdriverio && just test-ios
    ```
    *Générer cette présentation*
    ```bash
    just pdf    # → presentation/build/slides.pdf
    just pptx   # → presentation/build/slides.pptx
    ```
  ],
  [
    *Structure du repo*
    ```
    ami-tests-e2e/
    ├── justfile        # build, simulateurs, présentation
    ├── maestro/
    │   ├── flows/       # scénarios E2E
    │   ├── subflows/    # blocs réutilisables
    │   ├── elements/    # Page Objects cross-platform
    │   ├── guidelines/  # post-mortems documentés
    │   └── justfile
    ├── webdriverio/
    │   └── src/
    │       ├── tests/
    │       ├── pages/ + locators/
    │       └── helpers/
    └── presentation/
        ├── slides.typ    # cette présentation
        ├── assets/       # extraits de code
        └── make-pptx.py
    ```
  ],
)

== Liens utiles

#v(0.5em)
#table(
  columns: (1.5fr, 2.5fr),
  stroke: 0.5pt,
  fill: (x, y) => if y == 0 { luma(210) } else if calc.odd(y) { luma(250) } else { none },
  [*Ressource*], [*URL*],
  [Documentation Maestro], [`docs.maestro.dev`],
  [Mobilewright (à surveiller)], [`github.com/mobile-next/mobilewright`],
  [Appwright (gelé depuis 12/2024)], [`github.com/empirical-run/appwright`],
  [maestro-runner (OSS — multi-device farm)], [`github.com/devicelab-dev/maestro-runner`],
  [WebdriverIO], [`webdriver.io`],
  [Testing Library pour WebdriverIO], [`testing-library.com/docs/webdriverio-testing-library/intro`],
  [Serenity/JS — Screenplay Pattern], [`serenity-js.org`],
  [Touying — framework slides typst], [`touying-typ.github.io`],
)
