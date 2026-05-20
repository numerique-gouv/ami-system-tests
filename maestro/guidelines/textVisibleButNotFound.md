# Texte visible mais non trouvé par Maestro dans une WebView

## Pourquoi ça arrive : l'arbre d'accessibilité paresseux

Le problème vient d'une discontinuité fondamentale entre le rendu visuel et l'arbre d'accessibilité dans les WebViews :

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

Causes principales :

1. **Lazy population** — sur iOS (WKWebView) et Android (SystemWebView), l'arbre d'accessibilité du contenu web n'est peuplé que quand le système d'accessibilité le demande activement — ce qui ne se produit pas au simple chargement visuel.
2. **Off-screen culling** — les éléments hors viewport ne sont pas dans l'arbre. Un scroll force la WebView à recalculer quels éléments méritent d'être exposés.
3. **Bridge natif → web paresseux** — le pont entre `UIAccessibility` (iOS) / `UiAutomator2` (Android) et le moteur web est déclenché par la première interaction ou par une requête explicite d'accessibilité.

---

## Solution principale : `androidWebViewHierarchy: devtools`

C'est la **solution officielle documentée** par Maestro pour les WebViews sur Android. À placer en en-tête du fichier de flow :

```yaml
androidWebViewHierarchy: devtools
---
- launchApp:
    appId: fr.gouv.ami.staging
- assertVisible:
    text: "Mon texte dans la WebView"
```

Sans `devtools`, Maestro passe par les APIs d'accessibilité natives du système (lazy). Avec `devtools`, il passe par Chrome DevTools Protocol (CDP) qui injecte un script JavaScript pour traverser le DOM directement via `document.body` et `getBoundingClientRect()`. L'arbre est alors complet et synchrone.

> **Limite iOS** : cette option n'a pas d'équivalent iOS. Sur iOS, Maestro reste contraint par XCTest et le bridge d'accessibilité WKWebView.

---

## Patterns complémentaires

### 1. `scrollUntilVisible`

Plus robuste qu'un `scroll` manuel suivi d'un `assertVisible` : Maestro s'arrête dès que l'élément est détecté dans l'arbre.

```yaml
- scrollUntilVisible:
    element:
      text: "Texte à trouver"
    direction: DOWN
    timeout: 5000
    speed: 40
    visibilityPercentage: 100
```

### 2. Sélecteurs stables — priorité aux attributs d'accessibilité

| Priorité | Sélecteur | HTML |
|----------|-----------|------|
| ★★★ | Texte visible | contenu textuel |
| ★★★ | `aria-label` | `aria-label="..."` |
| ★★☆ | `data-testid` | `data-testid="..."` |
| ★★☆ | `id` HTML | `id="..."` |
| ★☆☆ | Coordonnées | à éviter |

```html
<!-- Dans le contenu web AMI -->
<button aria-label="Envoyer le message" data-testid="send-button">
  Envoyer
</button>
```

```yaml
# Dans le flow Maestro
- tapOn:
    text: "Envoyer le message"  # via aria-label
```

### 3. `assertVisible` attend automatiquement 7 secondes

Maestro relance automatiquement la vérification jusqu'à 7s — inutile d'ajouter des `sleep` avant. Le problème de l'arbre incomplet se manifeste quand l'élément n'est pas dans l'arbre **du tout**, pas juste en retard.

```yaml
# Pas besoin de sleep avant assertVisible
- assertVisible:
    text: "Contenu WebView"
```

### 4. Tap neutre + assert — workaround pour iOS

Sur iOS, sans équivalent `devtools`, le workaround consiste à forcer un tap sur une zone neutre pour réveiller le bridge d'accessibilité :

```yaml
- tapOn:
    point: "50%, 30%"   # zone neutre ou parent natif
- assertVisible:
    text: "Contenu WebView visible"
```

---

## Template complet pour AMI Android

```yaml
androidWebViewHierarchy: devtools
---
- launchApp:
    appId: fr.gouv.ami.staging
- scrollUntilVisible:
    element:
      text: "Contenu de la page web"
    direction: DOWN
    timeout: 8000
- assertVisible:
    text: "Contenu de la page web"
```

---

## Problème connu documenté : pagination iOS

La doc officielle signale un bug XCTest dans les `UITableView` / `UICollectionView` avec pagination : XCTest déclenche des `willDisplayCell` involontaires lors du scroll, ce qui peut provoquer des chargements de données parasites. Le fix est côté app (vérifier `indexPathsForVisibleRows` avant fetch), pas côté Maestro.

---

## Sources

- [Web Views | Maestro Docs](https://docs.maestro.dev/platform-support/web-views)
- [Known Issues | Maestro Docs](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues.md)
- [scrollUntilVisible | Maestro API](https://docs.maestro.dev/api-reference/commands/scrolluntilvisible)
- [Android Native — couche accessibilité](https://docs.maestro.dev/get-started/supported-platform/android/android-native.md)
- [WebDriver & WebView Support — DeepWiki](https://deepwiki.com/mobile-dev-inc/Maestro/4.3-webview-support)
- [Issue #2293 — Maestro ne reconnaît pas les IDs dans WebView](https://github.com/mobile-dev-inc/Maestro/issues/2293)
