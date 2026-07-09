# Stratégie de sélection des éléments (tl() / $() / driver.execute())

## Problème

Trois API concurrentes existent pour interagir avec la WebView SPA AMI (`tl()`, `$()`/`$$()`,
`driver.execute()`), plus les gestes natifs (`driver.action()`) hors WebView. Chacune a un
comportement différent face à deux contraintes indépendantes :

1. **La page peut être en train de naviguer** — `executeAsync` (utilisé par `tl()`) est tué par le
   driver si une navigation interrompt l'event loop pendant l'attente.
2. **La page peut se re-rendre entre le moment où un élément est trouvé et le moment où on agit
   dessus** (stale element) — un risque qui touche `tl()` et `$$()` dès qu'un handle est résolu
   puis réutilisé plus tard, mais pas `driver.execute()` (find+action dans le même appel JS
   atomique) ni un `$()` jamais pré-`await`é (`ChainablePromiseElement` qui se ré-résout à chaque
   commande).

Plusieurs allers-retours ont eu lieu en pratique sur des méthodes réelles du dépôt avant que ces
deux contraintes soient croisées avec le type de page concret :
- `getTopNotificationTitle()` a migré de `driver.execute` vers `$$()`+`.getText()`, puis est
  revenu en arrière après des `stale element` répétés en usage réel.
- `HomePage.clickLinkByText()` a suivi le même aller-retour dans `waitForDemarche()` (boucle de
  polling avec re-rendu réactif concurrent).
- `AvatarMenuPage.logout()` est passé de `tl().findByRole()` (handle figé) à
  `$('button=Confirmer')` (`ChainablePromiseElement` paresseux) pour la même raison.

## Décision

La règle opérationnelle retenue est résumée dans [CONTRIBUTING.md §2](../../CONTRIBUTING.md) :
`tl()` pour les interactions sur page stable, `driver.execute()` pour les sentinelles de
navigation et le find+action en contexte instable. Les trois squelettes de cycle complet
(« tuile » écran natif / WebView stable / WebView à information asynchrone) sont documentés
dans CONTRIBUTING.md §3.

Ce document archive le raisonnement détaillé — croisement type de page × action — qui a mené à
cette règle, pour référence future si un cas similaire se représente.

## Statut

Accepté.

## Détails

### Tableau 1 — Types de page × défis Android/iOS

| Type de page | Rechargement DOM | Requêtes async stale/tuées | ARIA disponible | Texte visible disponible | data-testid disponible | Moyens de sélection |
|---|---|---|---|---|---|---|
| **Écran natif simple** (ex. `onboarding-notifications.page.ts`, review-picker) | Total au niveau vue (recyclage de vues sur listes longues : RecyclerView Android / LazyColumn iOS) | Non concerné (pas de JS/WebView) — mais `waitForExist` préféré à `waitForDisplayed` sur iOS (élément SwiftUI présent dans l'arbre XCUITest avec `isDisplayed=false` pendant l'animation d'entrée) | Non — accessibilité native (`accessibilityIdentifier`/`contentDescription`), pas ARIA web | Oui, mais dépendant de la locale/casse | Non (pas de concept data-testid natif) | Android : resource-id / `UiSelector().text()` / `textContent()` ; iOS : `accessibilityIdentifier` (`~xxx`) / predicate string `label CONTAINS[c]`. Convergent vers un seul `~xxx` si le même identifiant est posé des deux côtés (SwiftUI `accessibilityIdentifier` = Compose `contentDescription`) |
| **WebView simple stable** (ex. `avatar-menu.page.ts` profil) | Partiel, réactif Svelte, pas de reload complet | Faible risque si l'appel a lieu après stabilisation de la page | Oui (rôle, label associé à un input) | Oui | Oui (`[data-testid="..."]` posés côté app) | `tl()` (role/label), `$()`/`$$()` (CSS/testid), `driver.execute` |
| **WebView avec redirections OIDC** (ex. `franceconnect.page.ts`) | Total à chaque redirect cross-origin (SPA AMI → serveur FC → fip1-low → callback AMI → SPA AMI) | Élevé : AX tree WKWebView figé pendant les transitions iOS ; contexte WKRDP non-ré-inspectable ~25s si on sort de `withWebView` pendant une navigation cross-origin | Variable selon la page tierce (FranceConnect, hors contrôle de l'app AMI) | Variable | Non (pages hors app AMI) | `driver.execute()` quasi systématique sur iOS/fip1-low (`$()` échoue après plusieurs redirections cross-origin, bug WKRDP documenté) ; `tl()` seulement pour les interactions sur la page eIDAS initiale, avant tout redirect |
| **WebView à information asynchrone** (ex. `notifications.page.ts`, backend sans push testé) | Partiel, déclenché par un rafraîchissement explicite (reload/pull-to-refresh) **pendant** que le test lit la page | `executeAsync` (`tl()`) risque timeout si tué par un re-render concurrent ; **`$$()`+`.getText()` risque un `stale element`** entre capture et lecture (constaté sur `getTopNotificationTitle`) | Partiel (headings noyés dans une longue liste de `<a>`, cf. heading "Notifications" longtemps cru absent) | Oui, mais change sous les yeux du test | Non systématique | `driver.execute()` en priorité pour toute lecture (snapshot atomique) ; `tl()` seulement en interaction ponctuelle post-stabilisation |
| **Écran natif/WebView avec geste physique** (scroll longue liste native, pull-to-refresh) | Recyclage de vues pendant le geste (listes natives) | Non concerné directement, mais le geste doit s'exécuter en `NATIVE_APP` — intercepté par la WebView sinon, n'atteint jamais le conteneur natif sous-jacent (`SwipeRefreshLayout` Android) | — | — | — | `driver.action('pointer', {parameters:{pointerType:'touch'}})` hors `withWebView`. Sur iOS, `UIRefreshControl` peut bloquer le swipe pull-to-refresh — préférer `driver.execute(() => window.location.reload())` en WebView à la place |

### Tableau 2 — Catalogue des actions/consultations

Légende : **Sync** = `execute` (JS synchrone, atomique) / `executeAsync` (Testing Library, tué pendant navigation) / `WebDriver` (protocole standard, par commande). **Résiste** = résiste à un re-rendu concurrent du DOM entre le *find* et l'*act*. **Accès** = ce que l'API lit (ARIA role+name / innerText / textContent / data-testid-CSS).

#### 1. Attendre qu'une page/tuile soit affichée ET interactive (+ scroll dans une liste hors écran)

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `home.page.ts` `isHomeReachable`/`navigateHomeFromWebview` | `driver.execute` sur lien "Suivi" | execute | Oui | innerText |
| `home.page.ts` `clickLinkByText` | `driver.execute` | execute | Oui | innerText |
| `home.page.ts` `waitForVisible` | geste tap + `$(loc.screenRoot).waitForDisplayed()` | WebDriver | Partiel | data-testid/CSS |
| `demarches.page.ts` `assertVisibleDemarcheWith` | `for await ($$(loc.cardContent))` + `.getText()`, dans un `waitUntil` | WebDriver | Partiel (re-capturé à chaque interval, mais fenêtre stale intra-carte) | textContent/testid |
| `login.page.ts` `scrollToPickerTile` | boucle `isDisplayed()` sinon swipe natif `driver.action('pointer')` | WebDriver | Partiel | testid/CSS natif |
| `onboarding-notifications.page.ts` `dismiss` | `$(loc.dismiss).waitForExist()` (natif) | WebDriver | Partiel | testid/CSS natif |

#### 2. Vérifier qu'un contenu est présent (sans forcément attendre)

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `notifications.page.ts` `getTopNotificationTitle` | `driver.execute` : trouve + lit dans le même appel | execute | Oui (snapshot unique) | textContent |
| `avatar-menu.page.ts` `getIdentityBolds`/`getAddressBolds` | `for await ($$(...))` + `.getText()` | WebDriver | Partiel | textContent/CSS |
| `avatar-menu.page.ts` `getEmailBold` | `$(...).getText().catch(() => '')` | WebDriver | Partiel | textContent/CSS |
| `demarches.page.ts` `assertVisibleDemarcheWith` | `card.$(cardBadge).getText()` / `.getAttribute('href')` | WebDriver | Partiel | textContent + attribut |

#### 3. Attendre qu'un contenu apparaisse de façon asynchrone (backend sans push testé)

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `notifications.page.ts` `waitForNotification` | backoff `[500..8000]`, rafraîchissement explicite par plateforme, `tl().findByText(title, {}, {timeout:500})` | executeAsync | Oui par construction (tentative courte + rafraîchissement à chaque itération) | innerText |
| `notifications.page.ts` `openFromHome` | `waitUntil` + `driver.execute` sur heading "Notifications" | execute | Oui | innerText |

#### 4. Trouver et remplir un champ de saisie

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `avatar-menu.page.ts` `editPreferredUsername`/`editEmail`/`editAddress` | `tl().findByLabelText(...)` + `.setValue()` | executeAsync | Non (page stable requise) | ARIA/label |
| `franceconnect.page.ts` `fillCredentials` | `tl().getByLabelText(/identifiant/i)` + `.setValue()` | executeAsync | Non | ARIA/label |

#### 5. Vérifier qu'une page/tuile n'est plus affichée

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `avatar-menu.page.ts` `logout` | `$('button=Confirmer').waitForDisplayed({reverse:true})` — `$()` paresseux, jamais pré-`await`é | WebDriver | Oui (ré-résolution à chaque commande) | testid/CSS/texte |
| `franceconnect.page.ts` `submit` | `waitUntil(() => getUrl() !== urlBefore)` — disparition détectée par changement d'URL, pas par le DOM | WebDriver (`getUrl`) | Oui | URL |

#### 6. Autres (clic par texte/rôle, changement d'onglet, geste natif, switch de contexte)

| Fichier:méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|
| `home.page.ts` `clickLinkByText` | find+click dans le même appel `driver.execute` | execute | Oui (atomique) | innerText |
| `demarches.page.ts` `goToHome` | `tl().getByRole('link', {name:/Accueil/i})` + `.click()` | executeAsync | Non | ARIA role/name |
| `notifications.page.ts` `pullToRefresh` | geste natif `driver.action('pointer')`, hors `withWebView` | WebDriver natif | n/a | geste natif |
| `webview.ts` `refreshAxTree` | `driver.getPageSource()` — force la resync AX tree iOS | WebDriver | n/a | AX tree |
| `webview.ts` `withWebView` | switch de contexte + reset `scriptTimeout` + re-sélection window handle | `driver.switchContext()` | n/a | contexte |

### Synthèse transversale

- **Deux régimes de résilience** : `driver.execute()` (JS synchrone, snapshot atomique) survit à
  une navigation SPA en cours et aux re-rendus concurrents — à privilégier pour les sentinelles
  de navigation et tout find+action dans un contexte instable. `tl()` (`executeAsync`) est tué par
  une navigation active — à réserver aux pages stables.
- **`$$()`+`.getText()` par élément** laisse une fenêtre de staleness entre la capture de la liste
  et la lecture de chaque élément. Tolérable dans une boucle `waitUntil` qui re-capture à chaque
  tentative (`assertVisibleDemarcheWith`), risqué en lecture ponctuelle sur une page qui se met à
  jour en tâche de fond (`getTopNotificationTitle`, corrigé en `driver.execute`).
- **`$()` jamais pré-`await`é** se ré-résout à chaque commande — un bon compromis intermédiaire
  entre `tl()` (figé, sémantique) et `driver.execute` (atomique, verbeux), utile pour confirmer
  une disparition sans dépendre d'un handle sur un élément qui vient d'être retiré.
- **Gestes natifs** (`driver.action('pointer')`) : toujours hors `withWebView` (contexte
  `NATIVE_APP`), sinon interceptés par la WebView et n'atteignent jamais le conteneur natif
  sous-jacent.
- Le seul cas où `$()`/`$$()` sont **incontournables** (pas un choix de style) : les écrans
  natifs, où ni `tl()` ni `driver.execute()` n'ont de prise (pas de moteur JS côté natif).
