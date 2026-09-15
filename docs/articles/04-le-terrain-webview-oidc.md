---
title: Le terrain WebView et OIDC
date: 2026-09-01
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 4
statut: brouillon
sources:
  - docs/adr/2026-07-09-Strategie-de-selection-des-elements.md
  - docs/adr/outils E2E/maestro/guidelines/textVisibleButNotFound.md
  - src/platform/appium.adapter.ts
  - src/driver/capabilities.ts
  - CONTRIBUTING.md
---

# Le terrain WebView et OIDC

## Un texte visible que le test ne trouve pas

Le symptôme le plus déroutant d'un test E2E sur app hybride tient en une phrase : le texte est là,
à l'écran, sous les yeux — et le test ne le trouve pas. La raison est une discontinuité entre deux
mondes qui ne se synchronisent pas tout seuls :

```
Rendu visuel (GPU)          Arbre d'accessibilité
┌─────────────────┐         ┌─────────────────────┐
│  WebView        │         │  NativeApp tree      │
│  ┌───────────┐  │         │  └─ WKWebView/       │
│  │ "Texte    │  │  ≠≠≠    │     WebView          │
│  │  visible" │  │         │     └─ [vide ou      │
│  └───────────┘  │         │         incomplet]   │
└─────────────────┘         └─────────────────────┘
```

L'arbre d'accessibilité d'une WebView ne se peuple que quand le système le demande activement — pas
au simple chargement visuel. Les éléments hors écran en sont absents (*off-screen culling*), et le
pont entre les APIs d'accessibilité natives et le moteur web ne se déclenche qu'à la première
interaction. Ce n'est un bug de rien ni personne : c'est la nature même d'une app hybride.

Ce constat, documenté pendant l'exploration Maestro d'AMI, vaut aussi pour WebdriverIO — les deux
outils pilotent la même WebView, avec les mêmes limites de fond. Ce qui change, c'est comment on les
contourne.

## Deux contraintes, pas une

La règle de sélection d'AMI (`tl()` pour Testing Library, `driver.execute()` pour le JavaScript
direct) ne répond pas à un seul problème mais à deux, indépendants :

1. **La page peut être en train de naviguer.** `tl()` repose sur `executeAsync`, que le driver tue
   si une navigation interrompt l'event loop pendant l'attente.
2. **La page peut se re-rendre entre le moment où un élément est trouvé et le moment où on agit
   dessus** — le *stale element*. Ce risque touche `tl()` et `$$()` dès qu'un handle est résolu puis
   réutilisé plus tard. Il ne touche pas `driver.execute()`, qui trouve et agit dans le même appel
   JavaScript atomique.

D'où la règle opérationnelle : `tl()` sur une page stable, `driver.execute()` pour les sentinelles
de navigation et le find-puis-action en contexte instable.

## Les allers-retours qu'on assume

La partie la plus honnête de cette règle n'est pas la règle elle-même, mais la trace des essais qui
l'ont précédée. L'ADR documente un revert réel :

> *« `getTopNotificationTitle()` a migré de `driver.execute` vers `$$()`+`.getText()`, puis est
> revenu en arrière après des `stale element` répétés en usage réel. »*
> — `docs/adr/2026-07-09-Strategie-de-selection-des-elements.md`

`AvatarMenuPage.logout()` a suivi le chemin inverse, pour la même raison de fond : de
`tl().findByRole()` (un handle figé au moment de la résolution) vers `$('button=Confirmer')`, un
`ChainablePromiseElement` qui se ré-résout à chaque commande WDIO. Ce n'est pas une hésitation, c'est
la preuve qu'aucune des deux API n'est universellement la bonne — seul le type de page tranche.

## Les pièges propres à chaque plateforme

Trois règles nées d'incidents réels, chacune avec sa trace dans le code :

**Un seul `inWebContext()` pour tout le flow FranceConnect, sur iOS.** En sortir au milieu d'une
navigation cross-origin bloque le contexte WKRDP pendant environ 25 secondes — non ré-inspectable.
La règle de CONTRIBUTING est donc absolue : le flow OIDC entier tient dans un seul passage en
contexte WebView, jamais fragmenté en plusieurs allers-retours.

**Un timeout WebKit explicite.**

```typescript
// src/driver/capabilities.ts — capabilities iOS
webkitResponseTimeout: 3000
```

Sans cette valeur, chaque appel à `getContexts()` bloque environ 10 secondes — un test qui
interroge la liste des contextes plusieurs fois en paierait le prix à chaque fois.

**Un geste natif ne s'exécute jamais depuis `inWebContext()`.** Intercepté par la WebView, il
n'atteint jamais le conteneur natif sous-jacent (`SwipeRefreshLayout` sur Android). Et sur iOS, le
`UIRefreshControl` natif peut carrément bloquer un geste de pull-to-refresh — la solution retenue
n'est pas un geste plus habile, c'est d'en sortir : `driver.execute(() =>
window.location.reload())` directement en WebView.

L'adaptateur de plateforme regroupe ces bascules dans une seule fonction, pour que les Page Objects
n'aient jamais à connaître le détail — y compris un piège annexe découvert en usage : pendant le
flow OIDC, l'onglet de callback se ferme juste après le redirect, laissant Chromedriver pointer sur
un handle de fenêtre périmé si on ne le re-sélectionne pas :

```typescript
// src/platform/appium.adapter.ts
async function inWebContext<T>(callback: () => Promise<T>): Promise<T> {
  const contexts = await waitForWebViewContext()
  const webviewContext = contexts.find((c) => c.startsWith('WEBVIEW_'))
  await driver.switchContext(webviewContext)

  // Après le switch, re-sélectionner le dernier window handle disponible.
  // Pendant le flow OIDC, le tab callback se ferme juste après le redirect ;
  // sans ce step, Chromedriver pointe sur un handle stale ("no such window").
  const handles = await browser.getWindowHandles()
  if (handles.length > 0) {
    await browser.switchToWindow(handles[handles.length - 1])
  }
  try {
    return await callback()
  } finally {
    await driver.switchContext('NATIVE_APP')
  }
}
```

## La règle qui protège tout le reste

Rien de tout ça n'a été deviné à l'avance. Chaque contournement de ce article vient d'un échec
observé, jamais d'une anticipation. C'est explicitement la culture du dépôt :

> *« Ne jamais commiter un locator ou un workaround qui n'a pas été validé en exécution réelle. Un
> commit de workaround hypothétique casse silencieusement un autre cas. »*
> — `CONTRIBUTING.md`

Un test qui échoue sur ce terrain-là n'est pas un signe que l'outil est mauvais. C'est un signe
qu'on vient d'apprendre quelque chose sur l'app.

---

*Dernier article de la série : ce que devient ce corpus de tests une fois branché à la CI — et
pourquoi un test rouge n'y bloque pas un déploiement.*