---
title: Un corpus, trois runtimes
date: 2026-09-01
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 3
statut: brouillon
sources:
  - test-suites.ts
  - src/platform/types.ts
  - src/pages/notifications.page.ts
  - src/tests/mobile/demarches.test.ts
  - CONTRIBUTING.md
  - CLAUDE.md
---

# Un corpus, trois runtimes

## Trois cibles, une seule vérité

AMI, c'est une webapp, une app Android et une app iOS. On pourrait imaginer trois répertoires de
tests, un par plateforme, chacun avec ses propres scénarios. Ce n'est pas ce que nous avons fait.

Nous avons un seul corpus de scénarios (`src/tests/mobile/`), et c'est la commande qui décide sur
quel runtime il s'exécute :

```bash
just test-android-suite CI   # Android, via Appium/UiAutomator2
just test-ios-suite CI       # iOS, via Appium/XCUITest
just test-webci-suite CI     # Chrome headless, via Chromedriver
```

Le mécanisme est court. Chaque configuration WDIO (`wdio.android.conf.ts`, `wdio.ios.conf.ts`,
`wdio.webapp.conf.ts`) déclare un glob de secours propre à sa plateforme, mais la variable
d'environnement `WDIO_SUITE` — posée par les recettes `just *-suite` — écrase ce glob par une suite
nommée, qui pointe systématiquement vers `src/tests/mobile/` :

```typescript
// test-suites.ts
export function resolveSpecs(defaultGlob: string): string[] | string[][] {
    const suiteName = process.env.WDIO_SUITE
    if (suiteName) {
        const suite = testSuites[suiteName]
        if (!suite) throw new Error(`Suite inconnue : "${suiteName}" …`)
        return suite
    }
    return [defaultGlob]
}
```

Résultat : la plateforme n'est pas un dossier de tests, c'est une **cible d'exécution**. Ce qui
diverge entre Android, iOS et Chrome est isolé dans une couche d'abstraction ; tout le reste — les
scénarios, les Page Objects — est écrit une fois.

## Pourquoi ça tient : l'app est une WebView

Ce n'est pas un tour de force générique, c'est une conséquence directe de l'architecture d'AMI :
l'application est une SPA Svelte, rendue dans une WebView aussi bien sur Android que sur iOS.
Android (UiAutomator2 → Chromedriver) et iOS (XCUITest → WebKit Remote Debugging) exposent tous
deux ce DOM via le protocole W3C WebDriver standard. Une requête Testing Library comme
`tl().getByRole('link', { name: /notifications/i })` s'exécute donc à l'identique des deux côtés.

Le dispatch par plateforme (`getXxxLocators()`, qui choisit entre `androidXxxLocators` et
`iosXxxLocators`) ne sert qu'aux **éléments natifs** — hors WebView : le bouton FranceConnect sur
Android, un écran d'onboarding SwiftUI sur iOS. C'est l'exception, pas la règle.

## Trois patterns qui portent le corpus

**Un POM à trois niveaux.** Les tests ne connaissent aucun sélecteur — ils appellent des méthodes de
Page Objects, qui elles-mêmes rappellent `getXxxLocators()` à chaque appel plutôt que de figer une
référence. Un test se lit comme un scénario métier :

```typescript
// src/tests/mobile/demarches.test.ts
await SuiviDemarchesPage.waitForDemarche(titleNew)
await SuiviDemarchesPage.assertVisibleDemarcheWith(titleNew, 'Brouillon')
await SuiviDemarchesPage.ouvreDemarche(titleNew)
await DemarcheDetailPage.assertLienExterne(urlV1)
```

**Un adaptateur de plateforme minimal.** Toute la surface du couplage mobile tient dans une
interface de six membres :

```typescript
// src/platform/types.ts
export interface PlatformAdapter {
  readonly kind: PlatformKind
  readonly fcButtonIsNative: boolean
  inWebContext<T>(callback: () => Promise<T>): Promise<T>
  isWebContextAvailable(): Promise<boolean>
  refreshAxTree(): Promise<void>
  pullToRefresh(): Promise<void>
}
```

Chaque membre correspond à un point de couplage réellement constaté dans les Page Objects — pas à
un besoin anticipé. `inWebContext()` bascule vers le DOM de la SPA sur mobile (contexte
`NATIVE_APP` → `WEBVIEW_*`) ; en webapp, c'est l'identité, la session entière est déjà ce contexte.

**Des suites en session partagée.** Une suite nommée n'est pas une simple liste de fichiers, c'est
un tableau de groupes : les fichiers d'un même groupe partagent une session Appium, donc une seule
authentification pour tout le groupe.

```typescript
// test-suites.ts
CI: [[
    r('src/tests/mobile/authentication.test.ts'),
    r('src/tests/mobile/notifications.test.ts'),
    r('src/tests/mobile/demarches.test.ts'),
    r('src/tests/mobile/profile.test.ts'),
]],
```

Le login FranceConnect n'est payé qu'une fois par groupe, pas une fois par fichier. La contrepartie
est une règle stricte : les `it()` restent indépendants les uns des autres, à une exception près,
documentée en commentaire — le cycle de vie d'une même démarche (créée, mise à jour, close), qui
partage volontairement son identifiant entre trois tests successifs.

## Qui teste quoi

Cette répartition par runtime a aussi un sens fonctionnel, pas seulement technique :

- **Android** porte les scénarios que webapp et iOS ne peuvent pas couvrir : notifications système
  (le pop-up hors app), l'authentification complète, et les échanges entre webapp et application
  mobile.
- **La webapp** valide les workflows purement web — tout ce qui est développé côté back et
  consultable sans application mobile.
- **iOS**, à terme, ne couvrira que le natif iOS qu'aucune autre plateforme ne peut exercer :
  Android émulé n'est pas connu d'Apple, donc les notifications système iOS ne se testent pas de
  cette façon-là.

---

*Prochain article : ce qui se passe quand ce corpus rencontre le vrai terrain — WebView, OIDC, et
tout ce qui casse un test qui cherchait un texte pourtant visible à l'écran.*