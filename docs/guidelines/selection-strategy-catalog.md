# Catalogue de stratégies de sélection/attente selon le type de page

Document de synthèse : croise le **type de page** et l'**action** voulue pour indiquer quelle API utiliser. Les guidelines détaillées (liées ci-dessous) documentent chaque cas individuellement — celui-ci sert d'index et de vue d'ensemble pour éviter de recouper plusieurs fichiers à chaque décision.

## 1. Symptôme

- `getTopNotificationTitle()` a migré de `driver.execute` vers `$$()`+`.getText()`, puis est revenu en arrière après des `WARN webdriver: Request encountered a stale element` répétés en usage réel.
- `HomePage.clickLinkByText()` a suivi le même aller-retour : `tl()` semblait plus simple, mais produisait des `stale element` dans `waitForDemarche()` (boucle de polling avec re-rendu réactif concurrent).
- `AvatarMenuPage.logout()` a dû passer de `tl().findByRole()` (handle figé) à `$('button=Confirmer')` (`ChainablePromiseElement` paresseux) pour la même raison.
- Dans chaque cas, le bug n'était pas une erreur de syntaxe : c'était le choix d'une API mal adaptée au type de page (page qui se re-rend pendant l'attente).

## 2. Pourquoi

Trois API concurrentes existent dans ce projet pour interagir avec une WebView (`tl()`, `$()`/`$$()`, `driver.execute()`), plus les gestes natifs (`driver.action()`) hors WebView. Chacune a un comportement différent face à deux contraintes indépendantes :

1. **La page peut être en train de naviguer** (executeAsync tué, cf. [semantic-locators.md §Limites des queries Testing Library](semantic-locators.md)).
2. **La page peut se re-rendre entre le moment où un élément est trouvé et le moment où on agit dessus** (stale element) — un risque distinct, qui touche `tl()` ET `$$()` dès qu'un handle est résolu puis réutilisé plus tard, mais pas `driver.execute()` (find+action dans le même appel JS atomique) ni un `$()` jamais pré-`await`é (`ChainablePromiseElement` qui se ré-résout à chaque commande).

Aucune des guidelines existantes ne croisait ces deux contraintes avec le type de page concret — d'où les allers-retours de cette session.

## 3. Solution

### Tableau 1 — Types de page × défis Android/iOS

| Type de page | Rechargement DOM | Requêtes async stale/tuées | ARIA disponible | Texte visible disponible | data-testid disponible | Moyens de sélection |
|---|---|---|---|---|---|---|
| **Écran natif simple** (ex. `onboarding-notifications.page.ts`, review-picker) | Total au niveau vue (recyclage de vues sur listes longues : RecyclerView Android / LazyColumn iOS) | Non concerné (pas de JS/WebView) — mais `waitForExist` préféré à `waitForDisplayed` sur iOS (élément SwiftUI présent dans l'arbre XCUITest avec `isDisplayed=false` pendant l'animation d'entrée) | Non — accessibilité native (`accessibilityIdentifier`/`contentDescription`), pas ARIA web | Oui, mais dépendant de la locale/casse | Non (pas de concept data-testid natif) | Android : resource-id / `UiSelector().text()` / `textContent()` ; iOS : `accessibilityIdentifier` (`~xxx`) / predicate string `label CONTAINS[c]`. Convergent vers un seul `~xxx` si le même identifiant est posé des deux côtés (SwiftUI `accessibilityIdentifier` = Compose `contentDescription`) |
| **WebView simple stable** (ex. `avatar-menu.page.ts` profil) | Partiel, réactif Svelte, pas de reload complet | Faible risque si l'appel a lieu après stabilisation de la page | Oui (rôle, label associé à un input) | Oui | Oui (`[data-testid="..."]` posés côté app) | `tl()` (role/label), `$()`/`$$()` (CSS/testid), `driver.execute` |
| **WebView avec redirections OIDC** (ex. `franceconnect.page.ts`) | Total à chaque redirect cross-origin (SPA AMI → serveur FC → fip1-low → callback AMI → SPA AMI) | Élevé : AX tree WKWebView figé pendant les transitions iOS ; contexte WKRDP non-ré-inspectable ~25s si on sort de `withWebView` pendant une navigation cross-origin | Variable selon la page tierce (FranceConnect, hors contrôle de l'app AMI) | Variable | Non (pages hors app AMI) | `driver.execute()` quasi systématique sur iOS/fip1-low (`$()` échoue après plusieurs redirections cross-origin, bug WKRDP documenté) ; `tl()` seulement pour les interactions sur la page eIDAS initiale, avant tout redirect |
| **WebView mise à jour par WebSocket** (ex. `notifications.page.ts`) | Partiel, déclenché par un événement externe **pendant** que le test lit la page | `executeAsync` (`tl()`) risque timeout 60s si tué par un re-render concurrent ; **`$$()`+`.getText()` risque un `stale element`** entre capture et lecture (constaté sur `getTopNotificationTitle`) | Partiel (headings noyés dans une longue liste de `<a>`, cf. heading "Notifications" longtemps cru absent) | Oui, mais change sous les yeux du test | Non systématique | `driver.execute()` en priorité pour toute lecture (snapshot atomique) ; `tl()` seulement en interaction ponctuelle post-stabilisation avec `browser.pause` hors `withWebView` entre tentatives (libère l'event loop pour le WebSocket) |
| **Écran natif/WebView avec geste physique** (scroll longue liste native, pull-to-refresh) | Recyclage de vues pendant le geste (listes natives) | Non concerné directement, mais le geste doit s'exécuter en `NATIVE_APP` — intercepté par la WebView sinon, n'atteint jamais le conteneur natif sous-jacent (`SwipeRefreshLayout` Android) | — | — | — | `driver.action('pointer', {parameters:{pointerType:'touch'}})` hors `withWebView`. Sur iOS, `UIRefreshControl` peut bloquer le swipe pull-to-refresh — préférer `driver.execute(() => window.location.reload())` en WebView à la place |

Sources détaillées : [webview-quirks.md](webview-quirks.md), [oidc-redirect-handling.md](oidc-redirect-handling.md), [webview-context-switching.md](webview-context-switching.md), [appium-configuration.md](appium-configuration.md), [cross-platform-page-objects.md](cross-platform-page-objects.md).

### Tableau 2 — Catalogue des actions/consultations

Légende : **Sync** = `execute` (JS synchrone, atomique) / `executeAsync` (Testing Library, tué pendant navigation) / `WebDriver` (protocole standard, par commande). **Résiste** = résiste à un re-rendu concurrent du DOM entre le *find* et l'*act*. **Accès** = ce que l'API lit (ARIA role+name / innerText / textContent / data-testid-CSS).

#### 1. Attendre qu'une page/tuile soit affichée ET interactive (+ scroll dans une liste hors écran)

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `home.page.ts` `isHomeVisible` | `waitUntil` + `driver.execute` sur lien "Suivi" | `driver.execute` | execute | Oui | innerText |
| `home.page.ts` `waitForDemarche` | Suivi→Accueil + `waitUntil` sur `document.body.innerText` | `driver.execute` | execute | Oui | innerText |
| `home.page.ts` `waitForVisible` | geste tap + `$(loc.screenRoot).waitForDisplayed()` | `$()` | WebDriver | Partiel | data-testid/CSS |
| `demarches.page.ts` `assertVisibleDemarcheWith` | `for await ($$(loc.cardContent))` + `.getText()` par carte, dans un `waitUntil` | `$$()`/`.getText()` | WebDriver | Partiel (re-capturé à chaque interval, mais fenêtre stale intra-carte) | textContent/testid |
| `login.page.ts` `scrollToPickerTile` | boucle `isDisplayed()` sinon swipe natif `driver.action('pointer')` | `driver.action()` + `$()` | WebDriver | Partiel | testid/CSS natif |
| `onboarding-notifications.page.ts` `dismiss` | `$(loc.dismiss).waitForExist()` (natif) | `$()` natif | WebDriver | Partiel | testid/CSS natif |

#### 2. Vérifier qu'un contenu est présent (sans forcément attendre)

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `notifications.page.ts` `getTopNotificationTitle` | `driver.execute` : trouve + lit dans le même appel | `driver.execute` | execute | Oui (snapshot unique) | textContent |
| `avatar-menu.page.ts` `getIdentityBolds`/`getAddressBolds` | `for await ($$(...))` + `.getText()` | `$$()`/`.getText()` | WebDriver | Partiel | textContent/CSS |
| `avatar-menu.page.ts` `getEmailBold` | `$(...).getText().catch(() => '')` | `$()` | WebDriver | Partiel | textContent/CSS |
| `demarches.page.ts` `assertVisibleDemarcheWith` | `card.$(cardBadge).getText()` / `.getAttribute('href')` | `$()`/`getAttribute` | WebDriver | Partiel | textContent + attribut |

#### 3. Attendre qu'un contenu apparaisse de façon asynchrone (WebSocket)

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `notifications.page.ts` `waitForNotification` | backoff `[500..8000]`, `browser.pause` **hors** `withWebView`, puis `tl().findByText(title, {}, {timeout:500})` | `tl()` | executeAsync | Oui par construction (tentative courte + pause hors WebView libère l'event loop) | innerText |
| `notifications.page.ts` `waitForNotification` (fallback iOS) | `driver.execute(() => location.reload())` + `waitUntil(readyState==='complete')` | `driver.execute` | execute | Oui | — |
| `notifications.page.ts` `openFromHome` | `waitUntil` + `driver.execute` sur heading "Notifications" | `driver.execute` | execute | Oui | innerText |

#### 4. Trouver et remplir un champ de saisie

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `avatar-menu.page.ts` `editPreferredUsername`/`editEmail`/`editAddress` | `tl().findByLabelText(...)` + `.setValue()` | `tl()` | executeAsync | Non (page stable requise) | ARIA/label |
| `franceconnect.page.ts` `fillCredentials` | `tl().getByLabelText(/identifiant/i)` + `.setValue()` | `tl()` | executeAsync | Non | ARIA/label |

#### 5. Vérifier qu'une page/tuile n'est plus affichée

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `avatar-menu.page.ts` `logout` | `$('button=Confirmer').waitForDisplayed({reverse:true})` — `$()` paresseux, jamais pré-`await`é | `$()` | WebDriver | Oui (ré-résolution à chaque commande) | testid/CSS/texte |
| `franceconnect.page.ts` `submit` | `waitUntil(() => getUrl() !== urlBefore)` — disparition détectée par changement d'URL, pas par le DOM | `driver.getUrl()` | WebDriver | Oui | URL |

#### 6. Autres (clic par texte/rôle, changement d'onglet, geste natif, switch de contexte)

| Fichier:ligne | Méthode | API | Sync | Résiste | Accès |
|---|---|---|---|---|---|
| `home.page.ts` `clickLinkByText` | find+click dans le même appel `driver.execute` | `driver.execute` | execute | Oui (atomique) | innerText |
| `demarches.page.ts` `goToHome` | `tl().getByRole('link', {name:/Accueil/i})` + `.click()` | `tl()` | executeAsync | Non | ARIA role/name |
| `notifications.page.ts` `pullToRefresh` | geste natif `driver.action('pointer')`, hors `withWebView` | `driver.action()` | WebDriver natif | n/a | geste natif |
| `webview.ts` `refreshAxTree` | `driver.getPageSource()` — force la resync AX tree iOS | `driver.getPageSource()` | WebDriver | n/a | AX tree |
| `webview.ts` `withWebView` | switch de contexte + reset `scriptTimeout` 60s + re-sélection window handle | `driver.switchContext()` | WebDriver | n/a | contexte |

### Synthèse transversale

- **Deux régimes de résilience** : `driver.execute()` (JS synchrone, snapshot atomique) survit à une navigation SPA en cours et aux re-rendus concurrents — à privilégier pour les **sentinelles de navigation** et tout **find+action** dans un contexte instable (page WebSocket, boucle de polling). `tl()` (`executeAsync`) est tué par une navigation active — à réserver aux **pages stables** (formulaires, boutons, une fois la destination confirmée).
- **`$$()`+`.getText()` par élément** laisse une fenêtre de staleness entre la capture de la liste et la lecture de chaque élément. Tolérable dans une boucle `waitUntil` qui re-capture à chaque tentative (`assertVisibleDemarcheWith`), risqué en lecture ponctuelle sur une page qui se met à jour en tâche de fond (`getTopNotificationTitle`, corrigé en `driver.execute`).
- **`$()` jamais pré-`await`é** (`ChainablePromiseElement`) se ré-résout à chaque commande — un bon compromis intermédiaire entre `tl()` (figé, sémantique) et `driver.execute` (atomique, verbeux), utile notamment pour confirmer une disparition (`waitForDisplayed({reverse:true})`) sans dépendre d'un handle sur un élément qui vient d'être retiré.
- **Où trouver chaque type d'accès** : innerText (texte visible tel que rendu — sentinelles de navigation, home/notifications), textContent (DOM brut, indépendant du CSS — identification de carte dans une liste), ARIA role/name (`tl()` — liens, boutons, labels de champ), data-testid/CSS (page profil, locators natifs).
- **Gestes natifs** (`driver.action('pointer')`) : toujours hors `withWebView` (contexte `NATIVE_APP`), sinon interceptés par la WebView et n'atteignent jamais le conteneur natif sous-jacent.

- [x] dans quels types de pages, les tl() ne fonctionne pas, mais les $() ou les $$() jamais awaité sont utile ?

  Trois cas concrets, par ordre d'importance :

  1. **Écrans natifs (hors WebView)** — `tl()` n'a même pas de sens ici (pas de DOM/JS à interroger). Ce n'est pas vraiment "tl() échoue, $() marche" au sens d'un choix technique : c'est le seul candidat possible dans ce contexte (`driver.execute()` non plus n'a pas de prise sur du natif). Voir tableau 1, ligne "Écran natif simple".
  2. **Élément qui va disparaître suite à l'action qu'on vient de faire, en WebView** — c'est exactement le cas `avatar-menu.page.ts logout()` traité cette session. Un handle `tl()` résolu (`await tl().findByRole(...)`) est figé ; le réutiliser pour un `waitForDisplayed({reverse:true})` après un clic qui supprime cet élément du DOM produit des `stale element`. `$()` jamais pré-`await`é se ré-résout à chaque commande via le protocole WebDriver standard (pas `executeAsync`) — "élément absent" s'y résout naturellement en "not displayed", sans la fenêtre de 60s d'un `executeAsync` tué.
  3. **Lire le contenu de plusieurs éléments dont on ne connaît pas le texte/rôle à l'avance** — `getIdentityBolds()`/`getAddressBolds()` (`avatar-menu.page.ts`) lisent tous les `<b>` d'une section sans savoir d'avance ce qu'ils contiennent. `tl()` a besoin qu'on lui dise CE qu'on cherche (un rôle+nom, un label, un texte) — il ne sait pas énumérer "tout ce qui matche ce sélecteur CSS" à l'aveugle. `$$()` fait ça nativement.


### Scénario A — le plus proche de l'interaction humaine

Principe : `tl()` par défaut (rôle ARIA, label, texte visible — ce qu'un utilisateur percevrait), `driver.execute` seulement aux points de bascule identifiés dans cette session (sentinelle de navigation, page à mise à jour WebSocket, find+action dans une boucle de polling). Chaque bascule est commentée pour qu'elle ne soit pas prise pour un oubli.

```typescript
// Mini-scénario : consulter une démarche, ouvrir une notification, remplir un champ, se déconnecter.
// Construit à partir de méthodes réellement présentes dans demarches.page.ts / notifications.page.ts /
// avatar-menu.page.ts — voir le tableau 2 pour chaque référence exacte.

await withWebView(async () => {
  // ✅ tl() — page stable, on cherche un lien par son rôle+nom accessible
  const accueil = await tl().getByRole('link', { name: /Accueil/i })
  await accueil.click()
})

// ⚠️ Bascule : sentinelle de navigation → driver.execute, pas tl().
// La page peut être en train de se re-rendre juste après le clic — executeAsync serait tué.
await browser.waitUntil(
  async () => driver.execute(() =>
    Array.from(document.querySelectorAll('a')).some(a => (a as HTMLElement).innerText?.trim() === 'Suivi')
  ) as Promise<boolean>,
  { timeout: 10000, interval: 500, timeoutMsg: 'Home non atteinte' }
)

await withWebView(async () => {
  // ✅ tl() — page stable, remplissage de formulaire par label accessible
  const input = await tl().findByLabelText('E-mail')
  await input.setValue('nouvel-email@example.com')
  const submitBtn = await tl().findByRole('button', { name: 'Enregistrer' })
  await submitBtn.click()
})

// ⚠️ Bascule : page notifications, mise à jour WebSocket en continu → driver.execute
// pour la lecture, pas $$()+.getText() (fenêtre de stale element constatée en usage réel).
const title = await withWebView(async () => driver.execute(() => {
  const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
  const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]'))
    .find(e => !EXCLUDED.has((e.textContent ?? '').trim()))
  return el ? (el.textContent ?? '').trim() : ''
}) as Promise<string>)
```

**Quand choisir cette philosophie** : code review orienté lisibilité et robustesse face aux changements de markup — `tl()` documente l'intention ("ce lien", "ce champ nommé X") indépendamment de la structure DOM sous-jacente. Convient à une équipe qui privilégie la proximité avec ce qu'un testeur humain observerait.

- [x] si on souhaite utiliser que tl() et driver.execute, est-ce qu'il y a des cas non couvert qui nous forceraient à utiliser des $() ou $$() ?

  Un seul cas vraiment incontournable : **les écrans natifs (hors WebView)**. Ni `tl()` (Testing Library, s'exécute dans le contexte JS d'une WebView) ni `driver.execute()` (JS dans le contexte browser) n'ont de prise sur les éléments natifs XCUITest/UiAutomator2 — les deux nécessitent un moteur JS, qui n'existe pas côté natif. `$()`/`$$()` avec des sélecteurs natifs (`accessibility id`, resource-id, predicate string) y sont donc obligatoires, pas un choix de style. Voir tous les exemples "Écran natif simple" du tableau 1.

  À l'intérieur d'une WebView, en revanche, il n'y a pas de cas dur : l'énumération de contenu inconnu (question précédente, point 3) reste faisable en `driver.execute` — c'est d'ailleurs ce que faisait le code de `getIdentityBolds()`/`getTopNotificationTitle()` avant sa migration vers `$$()` cette session — juste plus verbeux à écrire (`Array.from(document.querySelectorAll(...)).map(...)` au lieu de `$$(...).getText()`). Donc "`tl()` + `driver.execute` seuls" reste tenable en WebView ; c'est le passage au natif qui force `$()`/`$$()`.


### Scénario B — l'API la plus homogène

Principe : minimiser le nombre d'API différentes dans un même flux. Un seul modèle mental (`$()`/`$$()`, sélecteurs CSS/texte WDIO) à retenir, quitte à perdre la sémantique ARIA de `tl()`.

```typescript
// Même scénario, réécrit avec $()/$$() uniquement (sélecteurs texte WDIO comme
// `button=Confirmer`, déjà utilisé dans avatar-menu.page.ts logout()).

await withWebView(async () => {
  // $() paresseux — se ré-résout à chaque commande, pas de handle figé à gérer
  const accueil = $('a=Accueil')
  await accueil.click()
})

// Toujours driver.execute pour la sentinelle de navigation — $() seul ne suffit pas
// ici car on veut confirmer un état sur toute la liste de liens, pas un élément isolé.
await browser.waitUntil(
  async () => driver.execute(() =>
    Array.from(document.querySelectorAll('a')).some(a => (a as HTMLElement).innerText?.trim() === 'Suivi')
  ) as Promise<boolean>,
  { timeout: 10000, interval: 500, timeoutMsg: 'Home non atteinte' }
)

await withWebView(async () => {
  // $() par CSS plutôt que tl() par label — même mécanique que le clic ci-dessus.
  // Illustratif : il n'existe pas de locator CSS direct pour ce champ aujourd'hui dans le
  // repo (editEmail() utilise tl().findByLabelText('E-mail'), cf. avatar-menu.page.ts:190) —
  // c'est justement le coût de cette philosophie : il faudrait ajouter un data-testid côté
  // app là où tl() s'appuyait sur le label existant sans rien demander de plus.
  const input = $(`${loc.emailSection} input`)
  await input.setValue('nouvel-email@example.com')
  await $('button=Enregistrer').click()
})

// Lecture toujours en driver.execute (page WebSocket) — pas de changement par rapport
// au scénario A : c'est un point où $() n'est de toute façon pas une option sûre.
const title = await withWebView(async () => driver.execute(() => {
  const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
  const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]'))
    .find(e => !EXCLUDED.has((e.textContent ?? '').trim()))
  return el ? (el.textContent ?? '').trim() : ''
}) as Promise<string>)
```

**Quand choisir cette philosophie** : contexte où l'équipe tourne ou où le nombre de patterns à maintenir doit rester minimal — un seul modèle de résilience (`$()` paresseux) à enseigner plutôt que trois. Coût : `$('a=Accueil')`/`$('${loc.emailSection} input')` couplent le test à un texte exact ou à un sélecteur CSS posé côté app, sans le calcul de nom accessible (aria-label, association label/input) que fait `tl()` — plus sensible à une refonte de composant qui changerait le texte affiché sans changer le rôle ARIA.

- [x] les $('a=Accueil') sont décrits comme devant avoir la syntaxe exacte des labels, il n'y a pas myen de faire des contains, de l'insensible à la casse, voir de la regexp ?

  Partiellement. WDIO propose deux stratégies de sélection par texte, toutes deux **sensibles à la casse** :
  - `$('=Texte exact')` — correspondance exacte (texte complet), utilisée pour les liens (`a=...`) ou plus généralement `=...`.
  - `$('*=Texte partiel')` — correspondance "contains" (sous-chaîne), donc un vrai `contains` existe (`$('a*=Accue')` matcherait "Accueil").

  Ce que WDIO ne propose **pas** nativement pour ce type de sélecteur texte : insensibilité à la casse, ni regexp. Pour ces deux besoins, il faut sortir du sélecteur texte WDIO et retomber sur une des deux autres API déjà documentées dans ce fichier :
  - `tl()` supporte nativement les regexp insensibles à la casse dans son paramètre `name` : `tl().getByRole('link', { name: /accueil/i })` (déjà utilisé dans `demarches.page.ts:goToHome` et `franceconnect.page.ts:selectEidasFaible`).
  - `driver.execute()` avec une comparaison JS manuelle : `el.textContent?.toLowerCase().includes(label.toLowerCase())` (déjà le pattern de `franceconnect.page.ts:selectEidasFaible`).

  C'est un coût concret du "Scénario B" (API homogène en `$()`/`$$()`) : dès qu'on a besoin d'insensibilité à la casse ou de regexp sur du texte, il faut soit accepter une exigence de correspondance exacte plus fragile, soit réintroduire `tl()`/`driver.execute` ponctuellement — l'homogénéité totale n'est donc pas toujours tenable jusqu'au bout.

Dans les deux scénarios, les bascules vers `driver.execute` restent identiques : ce ne sont pas des choix de philosophie mais des contraintes techniques incontournables (sentinelle de navigation, page WebSocket) — voir tableau 1 et 2 ci-dessus pour la liste complète des cas où `driver.execute` n'est pas optionnel.

## 4. Où c'est appliqué dans le dépôt

Voir les références fichier:ligne dans les deux tableaux ci-dessus — ce document n'introduit pas de nouveau code, il consolide des patterns déjà en place dans `src/pages/*.page.ts` et `src/helpers/webview.ts`.

## 5. Sources

- [semantic-locators.md](semantic-locators.md), [webview-quirks.md](webview-quirks.md), [oidc-redirect-handling.md](oidc-redirect-handling.md), [webview-context-switching.md](webview-context-switching.md), [appium-configuration.md](appium-configuration.md), [cross-platform-page-objects.md](cross-platform-page-objects.md), [retry-strategies.md](retry-strategies.md)
- Corrections de cette session : `home.page.ts` `clickLinkByText` et `notifications.page.ts` `getTopNotificationTitle` (aller-retour `driver.execute`→`$$()`/`tl()`→`driver.execute` après `stale element` constaté en usage réel Android+iOS), `avatar-menu.page.ts` `logout` (`tl()`→`$()`)

- [x] ajoute en-dessous des snippets de code où une méthode page va vérifier qu'une tuile est bien affichée et disponible, puis sélectione son contenu, rempli un input de la tuile, clique dans le bouton de la tuile, puis vérifie que la tuile a bien disparue. et ceux pour chaque type de pages (native, vebview stable, webview avec redirection, webview rafraichie en websocket, etc.), si le code est le même, on peut les regrouper. On fera ça avec tl() et driver.execute (sauf contrainte, aka native).
- [x] dans l'exemple WebView rafraîchie en WebSocket, montre l'implémentation de waitForNotification

  Fait — voir le pas 1 du bloc WebSocket en §3.1, `waitForNotification` est maintenant inlinée (code réel de `notifications.page.ts`) au lieu d'un appel boîte noire.

  Voir §3.1 ci-dessous. Deux types partagent le même code (WebView stable et WebView avec redirection OIDC, une fois sur une page stabilisée) — regroupés. La WebView WebSocket n'a pas d'input dans son domaine réel (liste de notifications, pas de formulaire) : le pas 3 y est adapté plutôt qu'inventé.

### 3.1 Cycle complet "tuile" par type de page

Cinq étapes communes : **1.** vérifier que la tuile est affichée ET interactive · **2.** lire son contenu · **3.** remplir un champ qu'elle contient · **4.** cliquer son bouton · **5.** vérifier qu'elle a disparu. Code adapté de méthodes réelles du dépôt (précisé à chaque bloc) — les parties non couvertes par du code existant sont marquées **illustratif**.

#### Écran natif — `$()` obligatoire, pas de tl()/driver.execute possible

Adapté de `login.page.ts` (review-picker) pour 1/2/4/5 ; le pas 3 (aucun champ de saisie dans les écrans natifs actuels du repo) est **illustratif**, construit sur le même modèle `$()`.

```typescript
// 1. Affichée ET interactive — waitForDisplayed suffit ici (pas de scroll dans cet extrait,
//    voir scrollToPickerTile pour le cas liste hors écran)
const tile = $(loc.pickerTile)
await tile.waitForDisplayed({ timeout: 10000 })
await tile.waitForClickable({ timeout: 5000 })

// 2. Lire son contenu
const label = await tile.getText()

// 3. Remplir un champ (illustratif — aucun écran natif actuel n'a de champ de saisie)
await $(loc.tileInput).setValue('valeur')

// 4. Cliquer son bouton
await tile.click()

// 5. Vérifier la disparition — $() paresseux, se ré-résout, pas de stale element
await tile.waitForDisplayed({ timeout: 10000, reverse: true })
```

#### WebView stable & WebView avec redirection OIDC (une fois stabilisée) — `tl()` en priorité

Même code dans les deux cas dès que la page ne bouge plus : adapté de `avatar-menu.page.ts` (`editPreferredUsername`, `navigate`) pour la partie formulaire, et de `franceconnect.page.ts` (`fillCredentials`, `submit`) pour la partie OIDC — les deux suivent exactement ce squelette une fois `withWebView()` entré et la page de destination confirmée stable.

```typescript
await withWebView(async () => {
  // 1. Affichée ET interactive — tl() attend et résout, safe car page stable
  const editBtn = await tl().findByRole('button', { name: 'Modifier' })
  await editBtn.click()

  // 2. Lire son contenu (le champ affiche une valeur pré-remplie)
  const input = await tl().findByLabelText("Nom d'usage")
  const currentValue = await input.getValue()

  // 3. Remplir le champ
  await input.setValue('Nouvelle valeur')

  // 4. Cliquer le bouton de la tuile
  const submitBtn = await tl().findByRole('button', { name: 'Enregistrer' })
  await submitBtn.click()

  // 5. Vérifier la disparition — sentinelle driver.execute, PAS tl() : la page vient
  // d'être re-rendue par le submit, executeAsync risquerait d'être tué (cf. tableau 2 §5)
  await browser.waitUntil(
    async () => driver.execute((sel: string) => !document.querySelector(sel), loc.editContainer) as Promise<boolean>,
    { timeout: 5000, interval: 300, timeoutMsg: 'Formulaire toujours affiché après enregistrement' }
  )
})
```

**Nuance OIDC** : sur iOS/fip1-low, les pas 1/2/3/4 tombent en fallback `driver.execute` si `tl()`/`$()` échouent (bug WKRDP documenté, cf. tableau 1 et `franceconnect.page.ts:submit`) — le squelette reste identique, seule l'implémentation de chaque étape bascule individuellement en cas d'échec, pas tout le flux.

#### WebView rafraîchie en WebSocket — `driver.execute` en priorité, `tl()` seulement en interaction ponctuelle

Adapté de `notifications.page.ts` (`waitForNotification`, `clickNotification`, `getTopNotificationTitle`). Pas de champ de saisie dans ce domaine réel (liste de notifications) — le pas 3 est omis plutôt qu'inventé ; il suivrait le même principe que le pas 2 s'il existait (lecture/écriture atomique via `driver.execute`, jamais `$$()`+`.getText()` sur cette page, cf. tableau 1).

```typescript
// 1. Affichée ET interactive — attente asynchrone (arrivée WebSocket). Implémentation réelle
// de waitForNotification() (notifications.page.ts) : backoff exponentiel, un withWebView minimal
// par tentative. Entre deux withWebView, le contexte repasse en NATIVE_APP : le debugger CDP se
// détache de la WebView, dont l'event loop redevient libre de traiter les messages WebSocket.
const backoffMs = [500, 1000, 2000, 4000, 8000]
let found = false
for (const delay of backoffMs) {
  await browser.pause(delay) // hors withWebView : WebView libre de recevoir la WebSocket
  found = await withWebView(() =>
    tl().findByText(title, {}, { timeout: 500 }).then(() => true).catch(() => false)
  )
  if (found) break
}
if (!found) {
  // Fallback : pull-to-refresh natif (Android) / reload WebView (iOS, UIRefreshControl
  // peut bloquer le swipe) pour forcer un rechargement HTTP si le WebSocket n'a rien livré.
  if (driver.isIOS) {
    await withWebView(async () => {
      await driver.execute(() => window.location.reload())
      await browser.waitUntil(
        async () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
        { timeout: 10000, timeoutMsg: 'Rechargement iOS non terminé en 10s' }
      )
    })
  } else {
    await pullToRefresh() // geste natif driver.action('pointer'), hors withWebView — voir tableau 1
  }
  await withWebView(async () => { await tl().findByText(title, {}, { timeout: 40000 }) })
}

await withWebView(async () => {
  // 2. Lire son contenu — driver.execute, snapshot atomique (pas $$()+.getText() : la page
  // peut se re-rendre sous nos yeux, cf. symptôme getTopNotificationTitle §1)
  const currentTitle = await driver.execute(() => {
    const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
    const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]'))
      .find(e => !EXCLUDED.has((e.textContent ?? '').trim()))
    return el ? (el.textContent ?? '').trim() : ''
  }) as string

  // 4. Cliquer la tuile — tl() acceptable ici : clic ponctuel sur page stabilisée entre deux
  // vagues WebSocket, pas une boucle de polling
  const item = await tl().findByText(title)
  await item.click()
})

// 5. Vérifier la disparition — driver.execute, même raison qu'au pas 2
await withWebView(async () => {
  await browser.waitUntil(
    async () => driver.execute((t: string) => !document.body.innerText.includes(t), title) as Promise<boolean>,
    { timeout: 5000, interval: 500, timeoutMsg: `"${title}" toujours visible après disparition attendue` }
  )
})
```

- [x] converti les exemples précédent pour utiliser les selecteur wdio plutôt que les tl() en utilisant des sélecteurs partiel

  Voir §3.2 ci-dessous. Conversion des blocs "WebView stable & OIDC" et "WebSocket" en `$()`/`$$()` avec sélecteur texte partiel (`*=`, cf. réponse à la question sur `$('a=Accueil')` ci-dessus) au lieu de `tl()`. Le bloc "Écran natif" n'a rien à convertir (déjà en `$()`, aucun `tl()`). Chaque conversion note le coût réel (pas juste "ça marche aussi") : perte de la recherche par rôle ARIA, sensibilité à la casse, ambiguïté si le texte partiel matche plusieurs éléments.

### 3.2 Conversion des exemples précédents en sélecteurs WDIO (`$()`/`$$()`, sélecteurs partiels)

#### WebView stable & OIDC — `$()` avec sélecteur texte partiel plutôt que `tl()`

```typescript
await withWebView(async () => {
  // 1. Affichée ET interactive — $() paresseux, sélecteur texte partiel `button*=...`
  // (contains, sensible à la casse — cf. tableau des limites du sélecteur texte WDIO ci-dessus)
  const editBtn = $('button*=Modifier')
  await editBtn.waitForClickable({ timeout: 5000 })
  await editBtn.click()

  // 2. Lire son contenu — plus de tl().findByLabelText (calcul de nom accessible) : il faut
  // un sélecteur CSS explicite sur l'input, donc un data-testid ou une structure DOM stable
  // à disposition (coût réel : ce hook n'existe pas forcément déjà côté app)
  const input = $(`${loc.identitySection} input`)
  const currentValue = await input.getValue()

  // 3. Remplir le champ
  await input.setValue('Nouvelle valeur')

  // 4. Cliquer le bouton de la tuile — même sélecteur texte partiel qu'au pas 1
  await $('button*=Enregistrer').click()

  // 5. Vérifier la disparition — inchangé : driver.execute reste nécessaire, ce n'est pas
  // un choix tl() vs $(), c'est la même contrainte "page qui vient de se re-rendre" (§2)
  await browser.waitUntil(
    async () => driver.execute((sel: string) => !document.querySelector(sel), loc.editContainer) as Promise<boolean>,
    { timeout: 5000, interval: 300, timeoutMsg: 'Formulaire toujours affiché après enregistrement' }
  )
})
```

**Ce qui se perd** : `tl().findByRole('button', {name:'Modifier'})` valide que l'élément a le rôle ARIA `button` ET le nom accessible "Modifier" (calculé depuis `aria-label`, texte visible, ou association `label`/`for`). `$('button*=Modifier')` ne vérifie que la balise et une sous-chaîne du texte brut — un `<button>` masqué (`display:none`) ou un texte partiel ambigu ("Modifier l'adresse" ET "Modifier l'email" matchent tous les deux `button*=Modifier`) ne sont plus distingués. Il faut alors un sélecteur plus spécifique (`data-testid`) pour lever l'ambiguïté — exactement le compromis déjà noté dans la conclusion du Scénario B.

#### WebSocket — `$()`/`$$()` avec sélecteur texte partiel plutôt que `tl()`

```typescript
// 1. Affichée ET interactive — même stratégie de backoff, recherche par sélecteur texte
// partiel WDIO ($()) plutôt que tl().findByText. Reste un WebDriver classique (pas
// d'executeAsync), mais perd la recherche "n'importe quel élément visible" de Testing
// Library : `*=` matche par défaut TOUT élément dont le texte contient la sous-chaîne
// (y compris des ancêtres qui englobent plusieurs items) — il faut restreindre à un tag/
// une classe pour retomber sur "l'item de la liste", pas un conteneur parent.
const backoffMs = [500, 1000, 2000, 4000, 8000]
let found = false
for (const delay of backoffMs) {
  await browser.pause(delay) // hors withWebView : WebView libre de recevoir la WebSocket
  found = await withWebView(() => $(`a*=${title}`).isExisting())
  if (found) break
}
if (!found) {
  if (driver.isIOS) {
    await withWebView(async () => {
      await driver.execute(() => window.location.reload())
      await browser.waitUntil(
        async () => driver.execute(() => document.readyState === 'complete') as Promise<boolean>,
        { timeout: 10000, timeoutMsg: 'Rechargement iOS non terminé en 10s' }
      )
    })
  } else {
    await pullToRefresh()
  }
  await withWebView(async () => { await $(`a*=${title}`).waitForExist({ timeout: 40000 }) })
}

await withWebView(async () => {
  // 2. Lire son contenu — inchangé : driver.execute reste la bonne option sur cette page
  // (page WebSocket, cf. §2) — ce n'est pas un point de comparaison tl() vs $()
  const currentTitle = await driver.execute(() => {
    const EXCLUDED = new Set(['Retour à la page précédente', 'Gérer', 'Notifications', ''])
    const el = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [role="heading"], a[href]'))
      .find(e => !EXCLUDED.has((e.textContent ?? '').trim()))
    return el ? (el.textContent ?? '').trim() : ''
  }) as string

  // 4. Cliquer la tuile — $() sélecteur texte partiel plutôt que tl().findByText
  await $(`a*=${title}`).click()
})

// 5. Vérifier la disparition — inchangé, driver.execute (même raison qu'au pas 2)
await withWebView(async () => {
  await browser.waitUntil(
    async () => driver.execute((t: string) => !document.body.innerText.includes(t), title) as Promise<boolean>,
    { timeout: 5000, interval: 500, timeoutMsg: `"${title}" toujours visible après disparition attendue` }
  )
})
```

**Ce qui se perd** : `tl().findByText(title, {}, {timeout:500})` cherche un texte dans TOUT le DOM sans présupposer la balise, et attend activement jusqu'au timeout donné (comportement `findBy*`). `$('a*=...')` suppose que l'item est un `<a>` (vrai ici d'après `notifications.locators.ts`, mais un changement de composant DSFR casserait ce sélecteur sans le casser pour `tl()`) et `isExisting()`/`waitForExist()` n'ont pas le même comportement d'attente actif que `findBy*` — d'où le maintien du `backoffMs` + `browser.pause` en boucle explicite plutôt que de déléguer l'attente à la query elle-même.