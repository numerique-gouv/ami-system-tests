# Spécification du modèle de surface de test

Version 1 — 2026-10-06. Statut : **spécification**, aucun outil ne la consomme (voir § 9).

## 1. Objet

Décrire de façon **formelle** et **exhaustive** :

- **Face A — la surface applicative** : tout ce que les apps AMI exposent (écrans, informations observables, actions possibles, API qui les alimentent, états requis) ;
- **Face B — les scénarios** : ce que chaque test de `src/tests/**` fait sur cette surface, sous forme de **trace** ;
- **le pont** : des références typées (§ 2) qui permettent de calculer la couverture (§ 6) et de vérifier la cohérence (§ 7).

Deux objectifs en découlent : écrire des scénarios qui naviguent, manipulent et consultent l'effet sur d'autres écrans (avec appels API) ; mesurer la couverture par écran, par information observée et par action.

### Non-objectifs

- **Aucun sélecteur, aucun code** : ils restent dans les Page Objects et les locators (CONTRIBUTING.md §1-2).
- Ce n'est pas le journal d'exploration : la méthode pour reconstruire la face A est dans `../reconstruction-modele-applicatif.md`, et le diagramme visuel dans `../schema-navigation-webapp.md`. Ce modèle en est la forme structurée.

## 2. Identifiants et références

Un identifiant est en `kebab-case` (`[a-z0-9]+(-[a-z0-9]+)*`), unique dans son périmètre. Une **référence** désigne un élément d'une app :

| Forme | Désigne | Exemple |
|---|---|---|
| `app:screen` | un écran | `ami-spa:profile` |
| `app:screen#action` | une action d'un écran | `ami-spa:profile#open-edit-identity` |
| `app:screen@observable` | une information observable | `ami-spa:profile@identity` |
| `app:%component#action` | une action d'un composant partagé | `ami-spa:%tab-bar#go-agenda` |
| `app:$state` | un état requis | `ami-spa:$authenticated` |
| `app:~operation` | une opération d'API | `ami-api-partenaire:~publish-notification` |

Dans le fichier d'une app, `app:` peut être omis pour les références internes. Dans un scénario, elle est obligatoire.

Cibles (`target`) : `webapp`, `android`, `ios`, `http` (test d'API sans interface), `partner-web` (Espace Partenaire, **non confirmé**).

## 3. Face A — modèle d'application

Un fichier par app dans `apps/*.yaml`, validé par `schema/app.schema.json`.

### 3.1 Entités

| Entité | Rôle | Champs clés |
|---|---|---|
| `app` | une app ou un système (SPA, natif, FranceConnect, API, Espace Partenaire) | `app`, `kind`, `targets`, `sources` |
| `state` | précondition nommée | `reached-by` (comment on l'atteint, côté test) |
| `operation` | appel d'API utilisable pour alimenter ou sonder | `method`, `path`, `feeds` (observables alimentés) |
| `component` | groupe d'actions partagé par plusieurs écrans (barre basse) | `shown-on` (écrans), `actions` |
| `screen` | écran, onglet, dialogue, page externe ou page d'erreur | `kind`, `route`, `identity`, `observables`, `actions` |
| `observable` | information lisible sur un écran | `type`, `source`, `fed-by` |
| `action` | ce que l'usager peut faire sur un écran | `kind`, `coverage`, `risk`, `effects`, champs propres au `kind` |

### 3.2 Types d'écran (`screen.kind`)

`page` (route de la SPA), `tab` (vue d'une page, route partagée), `dialog` (dialogue ou feuille), `native` (écran hors WebView), `external` (hors des apps AMI : site tiers, FranceConnect), `error` (page d'erreur).

### 3.3 Identité d'un écran

`identity` dit **comment l'écran se reconnaît lui-même** : un titre (`heading`), une route (`route`), ou les deux. Contrat :

> Un écran se vérifie lui-même. Une action source **ne vérifie jamais** sa destination : l'arrivée est établie par l'identité de la destination (§ 4.2).

Dans le code, cela correspond à une méthode d'identité du Page Object de l'écran. Un écran sans `identity` ne peut pas être cible d'une action `navigate` couvrable (anomalie de modèle, § 7).

### 3.4 Observables

Une information lisible sur un écran. `type` : `text`, `list`, `field` (donnée utilisateur modifiable), `toggle`, `toggles` (ensemble de bascules), `badge`, `link`. `source` : `static`, `user-data`, `operation` (alimenté par une API, avec `fed-by`), `derived`.

La liste des observables est **minimale au départ** : elle part de ce que les tests et les Page Objects lisent. Elle s'enrichit par la reconstruction du modèle applicatif.

### 3.5 Entrée par route

Tout écran qui a une `route` possède l'action implicite `goto-route` (`navigate`, `via: route`). Elle est couvrable comme n'importe quelle action. Elle sert aux écrans sans lien entrant (pages d'erreur) et aux raccourcis de test. Elle n'entre au dénominateur de la couverture que si l'écran n'a **aucun autre accès** (pas de `navigate` entrant, pas d'`entry`) ; sinon elle est informative, pour ne pas gonfler les « non couvertes » avec un raccourci.

## 4. Actions : kinds et protocoles

Chaque `kind` impose un **protocole** : une suite d'**étapes** nommées. L'étape est l'unité de couverture d'une action (§ 6).

| `kind` | Sens | Étapes (ordre imposé) | Champs obligatoires |
|---|---|---|---|
| `read` | consulter une information | `observe` | `observes` |
| `navigate` | changer d'écran | `trigger`, `arrive`, (`http-ok` si `transport`) | `to` |
| `mutate` | modifier une donnée utilisateur | `read-origin`, `mutate`, `read-mutation`, `restore` | `field` |
| `switch` | activer ou désactiver une fonctionnalité | `disable`, `absent`, `enable`, `present` | `toggle`, `gates` |

### 4.1 `read`

`observe` : la valeur est comparée à une attente (valeur de référence, ou donnée fournie par une opération d'API).

### 4.2 `navigate`

- `trigger` : le geste est exécuté sur la source.
- `arrive` : **la destination** confirme son identité (§ 3.3). Jamais la source.
- `http-ok` : uniquement si `transport` est déclaré. `transport.http` vaut `2xx` (ou équivalent). Il faut alors un contrôle du statut de chargement de la destination. Pour un écran natif, `transport.native` décrit l'équivalent (par exemple « écran d'erreur absent »). Si le contrôle n'est pas mesurable sur une cible, la cellule est `n/a` et non `covered`.
- `leaves-app: true` : la destination est `external`. `arrive` est alors vérifié par ce qui est observable côté app (lien présent avec la bonne cible) ou côté tiers, selon l'`evidence`.
- `conditional: true` : l'arête n'existe que sous condition (onboarding selon feature flag). La couverture **déclarée** compte l'étape si le scénario la déclare ; seule une trace mesurée (§ 9) peut confirmer qu'elle a eu lieu.

### 4.3 `mutate`

Protocole « lire, muter, relire, restaurer » :

1. `read-origin` : lire la donnée d'origine.
2. `mutate` : la modifier.
3. `read-mutation` : relire et constater la nouvelle valeur.
4. `restore` : remettre la valeur d'origine.

`field` désigne l'observable où l'origine et la mutation sont lues. `restore` du modèle dit **comment** la restauration est possible : `action` (rejouer la mutation avec la valeur d'origine), `api`, `logout` (effet de bord de la déconnexion), `none` (alors `coverage: excluded` obligatoire).

### 4.4 `switch`

Protocole « disable, absent, enable, présent » :

1. `disable` : désactiver.
2. `absent` : constater l'absence de la fonctionnalité (`gates.absent-probe`).
3. `enable` : activer.
4. `present` : constater sa présence (`gates.present-probe`).

`gates` décrit la fonctionnalité gouvernée : `capability` (texte libre), `probe` (observable où l'on constate), et `feed` (opération d'API qui produit l'événement observé). Exemple : désactiver, publier une 1re notification, constater qu'elle n'arrive pas, activer, publier une 2e, constater que seule la 2e arrive. L'état initial est lu, jamais supposé (`initial` : `enabled`, `disabled` ou `unknown`, une indication et non une hypothèse).

### 4.5 Modificateurs communs

| Champ | Valeurs | Sens |
|---|---|---|
| `coverage` | `required` (défaut), `excluded` | `excluded` impose un `reason` : décision documentée de ne pas tester. |
| `risk` | `shared-data`, `destructive`, `permission-prompt`, `third-party`, `legal` | Nature du danger à l'exécution. Informatif, mais un `required` avec `risk` doit avoir une stratégie dans le scénario (`cleanup`). |
| `effects` | liste de références `@observable` | **Effet attendu sur d'autres écrans**. Ce sont les liens non-navigationnels du modèle. Une action qui a des `effects` n'est « couverte au niveau effet » que si un scénario observe ces observables après l'action. |
| `params` | `{nom: [valeurs]}` + `per-value` | Variantes énumérées (zones, partenaires, checklists). `per-value: true` : une cellule par valeur ; sinon une valeur suffit. |
| `via` | `button`, `tab`, `route`, `back`, `link` | Geste de navigation. |

## 5. Face B — modèle de scénarios

Un fichier par répertoire de `src/tests/` dans `scenarios/*.yaml`, validé par `schema/scenarios.schema.json`.

### 5.1 Scénario

Un scénario correspond à **un `it()`** (ou une instance d'un `it()` généré par une boucle : une entrée par instance, `source.parametrized: true`).

| Champ | Sens |
|---|---|
| `id` | identifiant unique : `<cible>.<fichier>.<nom>` |
| `source` | `file` (relatif au dépôt), `describe`, `it` (titre exact, gabarit si paramétré) |
| `status` | `active`, `skipped` (`it.skip` ou `describe.skip`, avec `reason`), `backlog` (squelette sans implémentation) |
| `targets` | cellules de couverture concernées |
| `requires` | états nécessaires (`app:$state`) |
| `trace` | ce que le scénario fait, dans l'ordre (§ 5.2) |
| `cleanup` | restaurations de données (§ 5.3) |
| `tags` | `epic`, `feature`, `severity` Allure reprises du code |
| `intends` / `unmodeled` | pour `skipped` et `backlog` : références visées, et éléments qui n'existent pas encore dans la face A |

### 5.2 Trace

Une liste ordonnée d'éléments. Quatre formes :

| Forme | Sens | Effet de couverture |
|---|---|---|
| `visit: <screen>` | l'écran est atteint et son identité vérifiée | écran visité (niveau 1) |
| `observe: <observable>` (+ `expect`) | l'information est lue et comparée | observable lu (niveau 2) |
| `do: <action>` (+ `steps`, `with`) | l'action est exécutée selon son protocole | étapes d'action (niveau 3) |
| `call: <operation>` (+ `with`) | appel d'API | alimentation de données, enregistrée pour le diagnostic |

`steps` (sur `do`) liste les étapes **réellement accomplies et vérifiées** par le scénario. Absent, il vaut « toutes les étapes du protocole ». Une action `do` dont le `steps` est partiel donne une couverture partielle : c'est le but.

Un `do` de kind `navigate` implique `visit` de la destination quand l'étape `arrive` figure dans `steps`. Il ne faut donc pas répéter le `visit`.

### 5.3 Restauration

`cleanup` liste, pour chaque donnée mutée, comment elle est remise en état :

| Champ | Valeurs |
|---|---|
| `restores` | référence de l'observable ou de l'action concernée |
| `by` | `inline` (dans le test), `after-hook`, `logout` (effet de bord de la déconnexion), `none` |
| `assured` | `asserted` (la restauration est relue et vérifiée), `best-effort` (exécutée sans vérification, erreurs avalées) |

`best-effort` ne retire pas l'étape `restore` de la couverture, mais le rapport l'affiche comme avertissement.

## 6. Couverture

### 6.1 Unités et niveaux

| Niveau | Unité | Couverte quand |
|---|---|---|
| N1 | écran | un scénario `active` le `visit` (ou l'atteint par un `do navigate` avec `arrive`) |
| N2 | observable | un scénario `active` l'`observe` (ou l'observe via une étape `read-*`/`observe`) |
| N3 | étape d'action | un scénario `active` accomplit l'étape (§ 4) |

Une **arête** du graphe de navigation est une action `navigate` : sa couverture est celle de ses étapes. Le **parcours** est la suite des `do navigate` d'un scénario.

### 6.2 Cellule

Une cellule est `(unité, cible)`. La face A donne les cibles applicables (`screen.targets`, sinon `app.targets`). Statut d'une cellule :

| Statut | Condition |
|---|---|
| `covered` | toutes les étapes requises, ou l'unité N1/N2, sont accomplies par ≥ 1 scénario `active` sur cette cible. Les étapes d'une action se **cumulent** sur les scénarios de la cible ; le rapport signale `split` quand aucun scénario unique ne porte le protocole complet (cas des `it()` séquentiels de `profile_deletion_at_logout.test.ts`) |
| `partial` | au moins une étape accomplie, mais pas toutes (taux `k/n`) |
| `uncovered` | rien d'accompli, `coverage: required` |
| `excluded` | `coverage: excluded` (le `reason` est reporté) |
| `n/a` | cible non applicable, ou étape non mesurable (`http-ok` natif non défini) |
| `unconfirmed` | l'élément du modèle a `evidence: unconfirmed` : on ne calcule pas de taux, on liste |

`skipped` et `backlog` comptent pour **zéro** et sont affichés à part comme « prévus ».

### 6.3 Effets

Pour une action avec `effects`, le rapport ajoute une colonne « effet observé » : vraie si un scénario accomplit l'action puis observe chaque observable listé **après** elle dans la trace.

### 6.4 Taux

Taux d'écrans N1, d'observables N2 et d'étapes N3, par cible, en ne comptant que `coverage: required` et `evidence ≠ unconfirmed` au dénominateur. Les exclus et non confirmés sont rapportés séparément pour ne pas gonfler le résultat.

## 7. Règles de cohérence

Vérifiables mécaniquement :

| # | Règle |
|---|---|
| C1 | Toute référence (face A et B) se résout vers un élément existant. |
| C2 | Les identifiants sont uniques dans leur périmètre. |
| C3 | Tout `navigate.to` désigne un écran qui a une `identity`. |
| C4 | Tout écran `live` ou `code` est atteignable : lien `navigate` entrant, ou `route` (donc `goto-route`), ou `entry: true`. Les écrans `backlog` et `unconfirmed` en sont dispensés (leur graphe est inconnu). |
| C5 | Tout `mutate` déclare `restore` ; `restore: none` impose `coverage: excluded`. |
| C6 | Tout `switch` déclare `gates` avec les deux sondes. |
| C7 | `coverage: excluded` impose `reason`. |
| C8 | Dans un scénario, les `steps` d'un `do` appartiennent au protocole du `kind` de l'action. |
| C9 | Un scénario `active` qui fait `do` d'un `mutate` a un `cleanup` pour cette donnée. |
| C10 | Un scénario `active` fait référence à une `source.file` et un `source.it` qui existent dans le code. |
| C11 | Tout `it()` de `src/tests/**` est décrit par ≥ 1 scénario (exhaustivité de la face B). |
| C12 | Un élément `evidence: live` a `observed-on` ; `unconfirmed` n'a pas de `observed-on`. |

## 8. Preuve

Reprise de CLAUDE.md § Documentation. Chaque écran, observable et action porte `evidence` :

| Valeur | Sens | Exige |
|---|---|---|
| `live` | observé sur l'app en exécution | `observed-on` (date) |
| `code` | déduit du code source de l'app ou d'un test | `source` sur l'élément, ou à défaut celui de l'écran ou de l'app (`sources`) |
| `backlog` | n'apparaît que dans un test non implémenté | — |
| `unconfirmed` | supposé ou incertain | — (aucune date) |

Un élément `unconfirmed` n'entre pas dans les taux. Une anomalie constatée (modèle ≠ app) se note dans `note`, avec la date.

## 9. État et suite

Livré par cette version : la spec, les deux schémas, la description des apps (`apps/`) et des scénarios (`scenarios/`).

**Non livré** (à ne pas supposer) :

- aucune recette `just` ne valide les fichiers ni ne calcule la couverture ;
- aucune mesure à l'exécution : les scénarios décrivent le code **tel que lu**. La trace réelle viendrait de `traced()` (`src/helpers/traced.ts`), qui journalise déjà chaque appel de Page Object. Comparer trace mesurée et trace déclarée est l'extension naturelle ;
- la liste des observables est partielle (§ 3.4) ;
- les contrats de réponse d'API (`operations.*.responses`, ex. 401 sur Basic Auth invalide) sont décrits mais rattachés à aucune unité de couverture ;
- une arête n'a qu'une destination : les variantes (session FranceConnect déjà ouverte qui saute eIDAS) ne sont pas modélisables et vont en `note` ;
- les règles C1–C12 se valident par un script jetable ou à la main, comme avant le 2026-10-15 : aucun vérificateur n'est versionné dans le dépôt.

## 10. Conventions YAML

- YAML 1.1 lit `on`, `off`, `yes`, `no` comme des booléens : **jamais** comme clé ni comme valeur non guillemetée. C'est pourquoi le protocole `switch` utilise `disable`/`enable` et les composants `shown-on`.
- Une valeur qui contient une virgule, deux-points ou un guillemet se met entre guillemets, surtout dans un mapping en ligne `{…}`.
- Les ancres (`&nom`/`*nom`) et la clé de fusion `<<` sont permises ; les clés racine `x-…` sont réservées à ces ancres et ignorées par les schémas.
- Dates en ISO 8601 (`2026-10-02`).
