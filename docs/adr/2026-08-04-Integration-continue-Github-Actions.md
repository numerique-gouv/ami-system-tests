# Intégration continue — point d'entrée manuel et rapports Allure (Notification API : webapp / Android / iOS)

## Problème

Plusieurs contraintes structurent la solution :
- Les trois suites n'ont pas le même coût ni la même maturité : la suite webapp n'existe pas
  encore côté ce dépôt (`test-web-suite` est un stub), Android et iOS s'appuient sur des
  artefacts (APK/IPA) produits par les dépôts frères `ami-app-android`/`ami-app-ios` — jamais
  buildés depuis ce dépôt, seulement récupérés en artefact une fois disponibles.
- Les runners ne se valent pas : un runner `macos-latest` coûte environ 10× un runner Linux
  (macOS 3-4 core : $0,062/min contre $0,006/min pour Linux 2-core — cf. doc de facturation
  GitHub), ce qui pousse à garder iOS en stub le plus longtemps possible et à traiter Android
  sur `ubuntu-latest`.
- `.env.local` est requis par le `justfile` (`set dotenv-required`) pour tout usage local, mais
  matérialiser un tel fichier en CI serait un anti-pattern (secret sur disque, risque de fuite
  dans les logs/artefacts) — la bonne pratique GitHub est d'injecter les secrets/variables via
  `env:`, alimenté par des secrets/variables scopés à un **Environment** GitHub correspondant à
  la cible (`ref_name`).
- Tester ces workflows avant de les pousser sur `main` (seule branche où `workflow_dispatch`
  apparaît dans l'UI Actions) suppose un outillage local (`act`), qui a ses propres limites
  matérielles (pas d'accélération KVM, architecture hôte arm64 sur Mac Apple Silicon) sans
  rapport avec le comportement réel sur les runners GitHub-hosted.

Une fois ce point d'entrée en place, le job `report` chargé de publier les résultats Allure
appelait `allure-framework/allure-action@v0` sur un `./allure-report` que rien ne générait — non
fonctionnel dès le premier run réel. Le rendre fonctionnel devait en plus couvrir quatre
scénarios :
1. Une PR mise à jour plusieurs fois → le rapport/commentaire doit montrer le nouveau résultat
   **et** l'historique des runs précédents de cette PR (courbe de tendance).
2. Une 2ᵉ PR ouverte la même semaine → son rapport ne doit contenir aucun résultat de l'autre PR.
3. Deux PR concurrentes → aucun mélange de résultats.
4. PR fermée → les données Allure associées sont supprimées.

Contraintes structurantes propres à ce second volet :
- **Les PR vivent dans les dépôts frères** (notification-api / ios / android), pas dans
  `ami-system-tests` — ce sont eux qui déclenchent déjà `system-tests-E2E.yml` sur création,
  mise à jour et clôture de leurs PR, via un token d'App GitHub existant.
- **`ami-system-tests` est un dépôt privé.** Minutes de runner et stockage d'artifacts sont
  décomptés d'un quota gratuit puis facturés au-delà ($0,25/Go/mois de stockage, $0,006/min de
  runner Linux standard) — contrairement à l'hypothèse « gratuit car public » portée un temps
  par un commentaire de `ios.yml`, corrigée dans le même commit que cette ADR.
  Voir [About billing for GitHub
  Actions](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions).
- **`allure-framework/allure-action@v0` est écartée** : elle cible le format de sortie Allure 3
  (`allurerc.js`, `summary.json` à la racine) alors que ce projet génère avec Allure **2.44**
  (`allure-report/widgets/summary.json`) ; et elle poste son commentaire sur une PR **du dépôt
  courant**, via le contexte d'événement `pull_request` — inutilisable pour commenter une PR
  hébergée ailleurs.
- **Le CLI `allure` n'existe qu'en local** (Homebrew, absent de `package.json`) — invoquer
  `npm run report` en CI aurait échoué, et de toute façon `allure open` démarre un serveur qui
  bloquerait le job.
- **Un workflow réutilisable appelé cross-dépôt s'exécute dans le contexte de l'appelant** (son
  `github.event`, son `GITHUB_TOKEN`) — envisagé un temps pour déplacer génération/commentaire
  chez les dépôts frères, cette option a été écartée : la complexité E2E doit rester dans
  `ami-system-tests`, et le commentaire nécessiterait de toute façon de rapatrier les données du
  rapport depuis ce dépôt, donc le même token d'App GitHub — coût de plomberie sans bénéfice net.

## Décision

### Point d'entrée : workflow parent + workflows réutilisables symétriques

Un workflow parent `workflow_dispatch`, **`system-tests-E2E.yml`**, expose `ref_name` (nom
de branche/environnement, mappé sur `AMI_ENV`, défaut `staging`), `run_webapp`, `run_android`,
`run_ios` (booléens, défaut `false` — rien ne part sans déclenchement explicite),
`run_old_device` (booléen, défaut `true`, ne s'applique qu'à la suite Android), ainsi que
`source_repo` et `pr_number` (cf. § Isolation des rapports Allure ci-dessous).

Chacune des trois suites est un **workflow réutilisable** (`workflow_call`) séparé et symétrique,
appelé en parallèle (pas de `needs:` entre eux) :
- `webapp.yml` — `ubuntu-latest`, exécute réellement `just test-web-suite all`
  (stub côté justfile pour l'instant).
- `android.yml` — `ubuntu-latest`, boote un émulateur réel et lance
  `just test-android-suite all`.
- `ios.yml` — `macos-latest`, encore au stade stub (« hello world » + inputs),
  volontairement pas développé plus loin pour ne pas engager le coût macOS avant d'en avoir besoin.

Chaque enfant porte son propre `environment: ${{ inputs.ref_name }}` (pas le parent — un
`environment:` sur un job appelant n'a aucun effet sur les secrets consommés dans le workflow
appelé) et reçoit les secrets via `secrets: inherit`.

### Android — un seul appareil par run, choisi par `run_old_device`

Deux profils sont définis mais **mutuellement exclusifs** (`if: inputs.run_old_device` /
`if: !inputs.run_old_device`), pas un matrix classique qui les lancerait tous les deux :
- Pixel 6 / API 31 (Android 12) — le plus ancien appareil encore ciblé.
- Pixel 8 / API 35 (Android 15) — le plus récent.

Les deux utilisent `target: google_apis` (Play Services nécessaires aux notifications push
testées par ce projet, sans le Store) et `arch: x86_64` (seule architecture d'image système
publiée par Google pour API ≥ 31 sur Linux).

### Contournements documentés en commentaire dans les workflows

- **`android-actions/setup-android@v4`** installe `packages: 'platform-tools'` seulement, au
  lieu du défaut `'tools platform-tools'` — le paquet legacy `tools` dépend de `emulator`,
  indisponible pour `linux-aarch64` (uniquement pertinent en local sous `act`/Apple Silicon).
  Cf. issue amont [android-actions/setup-android#283](https://github.com/android-actions/setup-android/issues/283).
- Un step **« Activer KVM »** (règle udev standard documentée par
  [reactivecircus/android-emulator-runner](https://github.com/ReactiveCircus/android-emulator-runner))
  précède le boot de l'émulateur — l'accélération matérielle est disponible nativement sur les
  runners GitHub-hosted `ubuntu-latest` (x86_64) depuis 2023.
- Le `justfile` n'impose plus `.env.local` de façon inconditionnelle
  (`set dotenv-required := false`, littéral requis par `just` — pas d'expression conditionnable
  sur `CI`) ; l'obligation en local est réimplémentée par une recette de garde `_require-dotenv`,
  qui tolère l'absence du fichier dès que `CI` ou `GITHUB_ACTIONS` est présent dans
  l'environnement.

### Garde `env.ACT` — limites assumées de test local

`act` définit lui-même `env.ACT` (documenté sur nektosact.com), utilisé pour sauter, uniquement
en local, les steps qui ne peuvent structurellement pas fonctionner sous Docker Desktop sur Mac :
le step KVM (pas de démon udev dans un conteneur, `/dev/kvm` non relayé) et les deux steps
d'émulateur (sans accélération matérielle, le boot n'aboutit jamais et la step tourne jusqu'au
timeout de 10 minutes). Une piste de contournement complet (Apple Container + noyau custom
`CONFIG_KVM=y` + pont Docker-API tiers **Socktainer**) a été explorée et écartée : chaîne de 4
briques non officielles, aucune combinaison validée par Apple ni par les mainteneurs d'`act`,
pour un bénéfice limité au confort de test local. Ces steps ne sont donc validables que sur un
vrai run GitHub (`gh workflow run` après merge sur `main`), pas via `act`.

### Isolation des rapports Allure : `slug = source_repo assaini + pr_number`, pas `ref_name`

`source_repo` (`owner/repo` du dépôt frère) et `pr_number` servent de clé d'isolation. `ref_name`
reste dédié à son rôle ci-dessus (mapping `AMI_ENV`, `environment:`) — un nom de branche peut se
répéter entre dépôts frères ou être renommé en cours de PR, ce qui en ferait une mauvaise clé.

Ce `slug` sert de nom d'artifact : deux PR ont par construction des noms d'artifacts disjoints,
ce qui couvre nativement les scénarios 2 et 3 sans code de verrouillage explicite. Un
`concurrency: group: allure-${{ inputs.source_repo }}-${{ inputs.pr_number }}` (avec
`cancel-in-progress: false`) sérialise en plus les runs d'une **même** PR, seul cas restant à
protéger : la restauration/publication de l'historique est un cycle lecture-modification-écriture
non concurrent-safe.

### Deux artifacts distincts par run, avec des rétentions différentes

`allure generate` fusionne l'historique restauré (`allure-results/history/`) avec le run
courant et écrit le résultat cumulé dans `allure-report/history/` — le rapport complet contient
donc déjà l'historique à jour. Mesuré sur un run local : rapport complet **21 Mo** (captures
d'écran d'échec, snapshots DOM WebView), dossier `history/` seul **36 Ko** — facteur ~600.

Deux artifacts séparés, plutôt qu'un seul :
- `allure-report-<slug>-run<n>` — rapport HTML complet, `retention-days: 14`. Ce qu'un humain
  consulte ; peu d'intérêt à le garder longtemps.
- `allure-history-<slug>` — uniquement `allure-report/history/`, `retention-days: 90`. Ce que le
  *pipeline* consomme au run suivant (recherché via `gh api .../artifacts?name=...`, le plus
  récent non expiré, puis téléchargé par `artifact-id`). Doit survivre toute la durée de vie
  réaliste d'une PR, sinon une PR ouverte plus de 14 jours perdrait sa courbe de tendance entre
  deux pushes.

Un seul artifact aurait forcé à choisir entre payer 90 jours de stockage sur les captures
d'écran, ou perdre la continuité d'historique sur les PR longues — vu le coût de stockage sur
dépôt privé, la séparation évite les deux écueils.

Un `allure-results/executor.json` (buildName, buildUrl) est écrit avant génération, pour que
chaque point de la courbe de tendance soit identifiable et cliquable.

### Distinction des 3 plateformes dans un rapport fusionné

Le `historyId` Allure (clé d'identité d'un test, utilisée pour les retries et l'historique) est
un hash du nom complet **et des paramètres** du test — pas des labels. Fusionner les résultats
android/ios/webapp dans un même `allure-results/` sans les distinguer ferait passer des tests
homonymes sur deux plateformes pour des retries l'un de l'autre. `wdio.base.conf.ts` pose donc,
dans `beforeTest`, un paramètre **et** un label `platform` (`android`/`ios`/`webapp`, déduit de
`browser.isAndroid`/`isIOS`) — le paramètre fait diverger le `historyId`, le label permet le
filtrage/regroupement dans l'UI du rapport. Le label `run_old_device` (Android uniquement, lu
depuis `RUN_OLD_DEVICE`, exporté par `android.yml`) suit le même mécanisme.

### Commentaire cross-dépôt via token d'App GitHub

`GITHUB_TOKEN` n'a aucun droit d'écriture sur les dépôts frères. Le job `report` génère, via
`actions/create-github-app-token@v2`, un token scopé au seul `source_repo` à partir de l'App
GitHub déjà utilisée par les frères pour déclencher ce workflow (permission `pull-requests:
write` à lui ajouter sur ces 3 dépôts — prérequis hors de ce dépôt). Un step `github-script`
lit `allure-report/widgets/summary.json`, cherche sur la PR un commentaire marqué
`<!-- allure-report -->` et **ajoute une ligne** à son tableau plutôt que d'écraser le corps —
c'est ce qui rend l'historique des runs de la PR visible directement dans la conversation
GitHub (scénario 1), pas seulement dans la courbe de tendance Allure.

### Nettoyage explicite au close, pas seulement `retention-days`

Un workflow `allure-cleanup.yml` (`workflow_dispatch`, inputs `source_repo` + `pr_number`, même
calcul de `slug`), destiné à être appelé par les dépôts frères sur `pull_request: closed` (ils
réagissent déjà à cet événement). Il liste et supprime via l'API REST
(`DELETE .../actions/artifacts/{id}`) tous les artifacts `allure-history-<slug>` et
`allure-report-<slug>-*`.

Écarté : compter uniquement sur `retention-days`. Le job ne fait que quelques appels `gh api`
(pas de checkout) — coût négligeable (~0,006 $/fermeture de PR) — alors que laisser expirer
naturellement le stockage d'un dépôt privé continue de le facturer jusqu'à 90 jours après la
fermeture de la PR, sans jamais satisfaire littéralement le scénario 4 (« supprimées à la
clôture », pas « supprimées éventuellement »). `retention-days` reste un filet de sécurité si le
dispatch de cleanup échoue ou n'est jamais câblé côté dépôt frère.

### Génération du rapport encapsulée dans `just`

`allure-commandline` ajouté en devDependency (fige la version, indépendant du Homebrew local).
Nouveau target `just generate-report` (`allure generate allure-results --clean -o allure-report`,
sans le `allure open` de `npm run report`, qui bloquerait un job CI en démarrant un serveur) —
conforme à la règle CLAUDE.md d'encapsulation des appels `npm`/`npx` dans le `justfile`.

## Statut

Accepté pour l'architecture (parent + workflows réutilisables symétriques, injection de secrets
par `environment:`, appareil Android unique par run ; côté rapports Allure : isolation par slug,
deux artifacts à rétention différenciée, paramètre `platform`, commentaire via token d'App,
cleanup explicite).

Non vérifié faute de run GitHub réel au moment de la décision :
- comportement de `actions/download-artifact@v4` avec `pattern:` quand aucun artifact ne matche
  (webapp/ios n'exportent pas encore leurs `allure-results` — stubs) ;
- le flux `gh api` + `create-github-app-token` + `github-script` cross-dépôt dans son ensemble
  (`act` ne simule pas l'API artifacts ni les tokens d'App).

Travaux restants, hors périmètre de cette ADR :
- Suite webapp réelle (actuellement un stub `just test-web-suite`).
- Récupération de l'APK/IPA depuis les workflows des dépôts frères (`ami-app-android`,
  `ami-app-ios`) — aucun mécanisme de récupération d'artefact cross-repo n'est encore défini.
- Développement du workflow iOS au-delà du stub (simulateur, coût macOS assumé au moment venu).

Prérequis hors de ce dépôt, à faire dans les dépôts frères pour les rapports Allure — **obsolète,
voir § Révision — 2026-08-27 ci-dessous** : ni secrets d'App GitHub ni token cross-dépôt ne sont
finalement nécessaires, chaque dépôt frère commentant sa propre PR avec son `GITHUB_TOKEN` natif.
Restent à faire côté dépôts frères :
1. Passer `source_repo` + `pr_number` au `uses: workflow-e2e-main.yml` (déjà fait dans
   `ami-notifications-api`, cf. `workflow-e2e-webapp-shared.yml`).
2. Déclarer `permissions: pull-requests: write / checks: write` sur le job qui télécharge
   l'artefact `allure_report` et appelle `allure-action` (déjà fait côté `ami-notifications-api`,
   job `e2e-report`).
3. Brancher un dispatch de `allure-cleanup.yml` sur leur job existant `pull_request: closed`.

## Révision — 2026-08-27 : adoption d'Allure 3 et `allure-framework/allure-action@v0`

Le motif de rejet de l'action officielle ci-dessus (§ Décision, sous-section « Commentaire
cross-dépôt via token d'App GitHub ») portait sur le format de rapport — `allure-commandline`
(Allure 2.44, `allure-report/widgets/summary.json`) est remplacé par le paquet `allure` (Allure 3,
`allurerc.mjs`, plugin `awesome`), qui écrit `allure-report/summary.json` à la racine — exactement
ce que lit `allure-action`.

Le second point envisagé un temps pendant cette révision — appeler `allure-action` directement
dans `workflow-e2e-main.yml` en s'appuyant sur le fait qu'un `workflow_call` s'exécute dans le
contexte de l'appelant — a été **abandonné au profit de l'existant** : le dépôt frère
`ami-notifications-api` a déjà, en dehors de ce dépôt, un job `e2e-report` (dans
`workflow-e2e-webapp-shared.yml`) qui télécharge l'artefact `allure_report` exposé en output par
`workflow-e2e-main.yml` et appelle lui-même `allure-action`, avec son propre bloc
`permissions: pull-requests: write / checks: write`. C'est précisément cet appel, déjà écrit,
que le § Problème ci-dessus décrivait comme nommé « non fonctionnel dès le premier run réel » —
la seule pièce manquante était le format de rapport, pas la plomberie cross-dépôt. La migration
Allure 3 suffit donc à le débloquer, sans toucher aux permissions de `workflow-e2e-main.yml`
(`contents: read` + `actions: read` seulement) ni introduire de second point de commentaire.
`.github/workflows-samples/notification-api.pull-request.yml` a été remis en cohérence avec ce
partage des responsabilités (lancement + exposition d'artefact ici, téléchargement + commentaire
côté appelant).

Conséquences sur les arbitrages précédents :
- Les secrets `ALLURE_APP_ID` / `ALLURE_APP_PRIVATE_KEY` ne sont **plus requis** — le prérequis
  correspondant est retiré.
- L'historique passe du dossier `allure-report/history/` restauré/écrit par `allure generate` à un
  unique fichier `.allure/history.jsonl` (Allure 3, lu et ré-écrit en place), toujours publié comme
  artifact séparé (`allure-history-<slug>`, 90 j) pour les mêmes raisons de taille et de continuité
  entre pushes d'une même PR.
- `executor.json` reste utilisé tel quel — toujours lu par Allure 3 malgré le changement de format
  de rapport.
- Catégories (`categories.json`) et variables d'environnement (`environment.properties`) migrent
  vers `categories.rules` / `environments` / `variables` dans `allurerc.mjs` — ces fichiers n'ont
  plus d'équivalent en Allure 3.
- `allure-cleanup.yml` est promu de `workflows-samples/` vers `workflows/` (workflow actif), sans
  changement de logique — les noms d'artifacts ciblés restent identiques.

Non vérifié faute de run GitHub réel au moment de cette révision : le rendu effectif du
commentaire de PR par `allure-action@v0` (action en tag `v0`, surface d'API non stabilisée) et la
lecture du dossier `allure-results` généré par `@wdio/allure-reporter` (Allure 2) par le plugin
`awesome` d'Allure 3 — la documentation qualifie d'« expérimental » le support du *style* Allure 2
(plugins `classic`/`allure2`), pas la lecture des résultats bruts, mais seul un run réel confirme
que rien n'est perdu dans la conversion.

## Révision — 2026-08-27 : découplage E2E / gate Scalingo par `on: status`

### Problème observé

L'architecture décrite plus haut (§ Décision, workflows d'entrée `ami-notifications-api` avec un
job `e2e` chaîné en `needs: ci`) crée un deadlock, constaté en usage réel :

Scalingo attend que **tous les checks GitHub du commit** soient au vert avant de déployer
(auto-deploy branche + review app), documenté côté Scalingo comme « waits for the GitHub Actions
to succeed before proceeding with the automatic deployment » (analyse via l'API GitHub **Checks**,
cf. [New: GitHub Actions compatibility](https://scalingo.com/blog/new-github-actions-compatibility)).
Or le job `e2e` de `workflow-e2e-webapp-{pr,merge,tag}.yml` crée son check-run **dès l'ouverture de
la PR/le push**, avant même d'exécuter quoi que ce soit — et ce check reste `in_progress` tant que
`wait-for-scalingo-status` (§ Décision précédente) attend que Scalingo poste `deploy/sclng: <app>`
en `success`. Scalingo attend donc un check qui attend lui-même Scalingo : cercle qui ne se
dénoue que par le mauvais bout, l'ancien `exit 0` au timeout de `wait-for-scalingo-status` (30 s
par défaut) laissant les tests s'exécuter **contre l'ancien déploiement**, y réussir, et Scalingo
ne déployer la nouvelle version qu'après coup.

### Décision : sortir l'e2e du workflow que Scalingo observe, router après coup vers le bon cas

Le job e2e ne doit pas exister sur le commit tant que Scalingo n'a pas décidé de déployer. Il est
donc déplacé dans un workflow séparé, `ami-notifications-api/.github/workflows/e2e-after-deploy.yml`,
déclenché par **`on: status`** — l'événement GitHub qui réagit à *tout* changement de commit status
(API **Status**, distincte de l'API **Checks** que produisent les jobs Actions ; cf.
[Events that trigger workflows](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows)
et [About status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
pour la distinction).

Son job `guard` (1) vérifie que le dernier status `deploy/sclng` du SHA (s'il en existe un) est
`success` — règle volontairement tolérante : l'absence totale de status `deploy/sclng` sur ce SHA
ne bloque pas (cas où Scalingo n'est pas concerné par ce commit) ; (2) résout ensuite lequel des
trois cas s'applique — PR ouverte dont ce SHA est le head (`pr`), PR dont ce SHA est le
`merge_commit_sha` (`merge`), ou tag `*.*.*` pointant sur ce SHA (`tag`) — via `gh api
commits/{sha}/pulls` et `gh api tags`, la même logique de résolution que l'ancien `ci-push.yml`
(§ ci-dessous). Trois jobs conditionnels (`call-pr`/`call-merge`/`call-tag`) délèguent alors au
workflow réutilisable correspondant, désormais des **cibles `workflow_call` pures**
(`workflow-e2e-webapp-{pr,merge,tag}.yml`, plus aucun déclencheur `pull_request`/`push` direct) :
chacune porte sa propre config e2e (`run_webapp: CI` pour pr, `short` pour merge/tag,
`run_old_device: false` pour tag) et appelle `workflow-e2e-webapp-shared.yml` avec
`wait_for_scalingo_step: false` — la preuve du déploiement a déjà été vérifiée par `guard`.

Contraintes vérifiées sur `on: status` avant adoption :
- il ne se déclenche que si le fichier de workflow existe **sur la branche par défaut** du dépôt ;
- `GITHUB_SHA`/`GITHUB_REF` y valent alors le HEAD de la branche par défaut, **pas** le commit
  concerné par le status — tout doit passer explicitement par `github.event.sha`, jamais `github.sha`.
- pas de risque de bouclage : les check-runs que produit le job e2e lui-même (API Checks) ne
  redéclenchent pas `on: status` (API Status) ; et les événements créés avec le `GITHUB_TOKEN` par
  défaut ne créent de toute façon pas de nouveau run.

Vérifié empiriquement avant migration de `workflow-e2e-webapp-tag.yml` (le risque étant qu'un tag
non auto-déployé par Scalingo ne poste jamais de `deploy/sclng`, donc ne déclenche jamais l'e2e) :
`gh api repos/numerique-gouv/ami-notifications-api/commits/<sha-du-dernier-tag>/status` renvoie
bien `deploy/sclng: ami-back-prod` — la migration s'applique donc aux trois déclencheurs (pr,
merge, tag), pas seulement pr/merge.

### Retour à un `Tests` (ex-`pytest.yml`) auto-déclenché, indépendant de l'e2e

Le job `e2e` retiré des workflows d'entrée aurait pu laisser `ci-required.yml` (les 3 jobs requis)
en `workflow_call` pur, encore appelé explicitement par `-pr`/`-merge`/`-tag.yml` sur leur
déclencheur direct comme avant cette révision — mais ces trois fichiers n'ont plus aucune raison de
se déclencher directement sur `pull_request`/`push` une fois l'e2e sortie : leur seul rôle restant
est d'être invoqués en `workflow_call` par `e2e-after-deploy.yml`. Il faut donc que les jobs requis
retrouvent un déclencheur autonome.

`ci-required.yml` est l'exact renommage (commit `f49fb834`, « trigger a push run ») de l'ancien
`pytest.yml` (`name: Tests`, `on: [push]`), dont le seul changement de fond était `on: [push]` →
`on: workflow_call` (et un id de job `mobile-app-tests` → `mobile-app`, cosmétique). Cette révision
**annule ce changement de déclencheur** : `pytest.yml` est restauré à l'identique de son dernier
contenu avant renommage (commit `216dbd11`), avec son propre `on: [push]`. `ci-required.yml` et
`ci-push.yml` (le filet de sécurité qui compensait l'absence de déclencheur direct sur
`ci-required.yml`, désormais inutile) sont supprimés.

`on: [push]` sans filtre couvre nativement, sans code de résolution supplémentaire : un push direct
sur une branche, un push sur une branche de PR (`pull_request: synchronize` ne supprime pas
l'événement `push` sous-jacent), le commit de merge d'une PR (GitHub pousse ce commit sur la
branche cible), et la pose d'un tag. `pytest.yml` est donc à nouveau le seul et unique point
d'entrée des jobs requis — ce que Scalingo surveille avant de déployer —, complètement découplé de
`e2e-after-deploy.yml` et des trois `workflow-e2e-webapp-*.yml`, qui ne gèrent plus que l'e2e.

### `wait-for-scalingo-status` : timeout par défaut corrigé

L'action `.github/actions/wait-for-scalingo-status/action.yml` faisait `exit 0` (succès) au
timeout — c'est précisément ce qui permettait aux tests de partir contre l'ancien déploiement dans
le scénario ci-dessus, en silence. Corrigé en `exit 1` (un timeout est un échec, pas un feu vert),
et le timeout par défaut relevé de `30` à `900` secondes (30 s n'a jamais représenté un temps de
déploiement Scalingo réaliste). Cette action reste utilisée sur le seul chemin restant sans
événement `status` disponible : `workflow-e2e-webapp-manual.yml` (`workflow_dispatch`).

### `allure-framework/allure-action@v0` conservée, contexte `pull_request` fabriqué pour son step

Le job `e2e-report` de `workflow-e2e-webapp-shared.yml`, désormais déclenché depuis
`e2e-after-deploy.yml` sur un événement `status` (jamais `pull_request`), ne fournit plus
nativement le contexte qu'attend `allure-action`. Lecture du source
(`allure-framework/allure-action`, `src/index.ts`) : l'action calcule
`isPullRequest = eventName === "pull_request" && Boolean(payload.pull_request)` et retourne sans
rien poster si `!isPullRequest` — indépendant du format de rapport Allure 2/3 (ce n'est donc pas un
problème réglé par la migration Allure 3 du § précédent). `eventName`/`payload`/`sha` viennent de
`@actions/github` (`packages/github/src/context.ts`), dont le constructeur relit
`process.env.GITHUB_EVENT_NAME`/`GITHUB_EVENT_PATH`/`GITHUB_SHA` **à chaque instanciation**, sans
cache process-wide.

Plutôt que d'abandonner `allure-action`, un step préalable fabrique un événement `pull_request`
minimal (`{"pull_request": {"number": <pr_number>, "head": {"sha": <source_sha>}}}`, les deux
connus via les `inputs` du job) écrit dans `RUNNER_TEMP`, et le step `allure-action` surcharge
`GITHUB_EVENT_NAME`/`GITHUB_EVENT_PATH` via un `env:` **scopé à ce seul step** — sans effet sur les
autres steps du job ni sur le contexte réel du run. `headSha = pullRequest?.head.sha ?? sha` retombe
alors sur le SHA fabriqué (correct : sur `on: status`, le `github.sha` ambiant vaudrait le HEAD de
la branche par défaut, pas le commit réellement déployé) et `issue_number = pullRequest.number`
cible la bonne PR. Le job garde donc `checks: write` (utilisé par `octokit.rest.checks.create`
côté allure-action) en plus de `pull-requests: write`.

### Correction connexe : input cassé sur le déclenchement manuel

`workflow-e2e-webapp-manual.yml` déclarait un input `wait_for_scalingo_step` mais transmettait
`skip_scalingo_step: ${{ inputs.skip_scalingo_step }}` à `workflow-e2e-webapp-shared.yml` — les
deux noms étaient faux (ni l'input déclaré ni celui attendu par `shared.yml` ne s'appellent
`skip_scalingo_step`), ce qui cassait silencieusement ce chemin (l'input `wait_for_scalingo_step`
de `shared.yml` retombait sur son défaut `true` au lieu de la valeur choisie). Corrigé en
`wait_for_scalingo_step: ${{ inputs.wait_for_scalingo_step }}`, cohérent avec le nom déclaré.

### Statut

Accepté. Non vérifié faute de run GitHub réel au moment de cette révision :
- le comportement observé de Scalingo une fois le check e2e créé *après* le `success` (pas de
  re-déclenchement ni de nouvelle attente sur un déploiement déjà effectué — déduit du principe
  documenté, pas garanti par écrit par Scalingo) ;
- le rendu effectif du commentaire `allure-action` avec l'événement `pull_request` fabriqué (le
  mécanisme de surcharge d'env par step est standard, mais dépend du comportement non documenté par
  contrat de `@actions/github`, qui pourrait changer) ;
- la résolution du cas `tag` par `guard` (`gh api repos/.../tags`, sans garantie de pagination
  suffisante si le dépôt a un grand nombre de tags — `--paginate` est censé couvrir ce cas mais n'a
  pas été exercé sur un vrai run).

## Notes

- Le remote GitHub du dépôt est `numerique-gouv/ami-system-tests` (le nom du dépôt local,
  `ami-tests-e2e`, diffère du nom du dépôt distant).
- Ce dépôt est **privé** — minutes de runner et stockage d'artifacts sont décomptés d'un quota
  gratuit puis facturés au-delà, pas gratuits/illimités comme sur un dépôt public.
- `workflow_dispatch` n'apparaît dans l'onglet Actions que si le fichier existe sur la branche
  par défaut (`main`) — invisible tant que la branche de travail n'est pas mergée.
- Commande de test local de référence (limites ci-dessus comprises) :
  `act workflow_dispatch -W .github/workflows/system-tests-E2E.yml --container-architecture linux/amd64 --input ref_name=staging --input run_android=true`.
