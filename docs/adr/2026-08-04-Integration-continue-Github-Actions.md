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

Prérequis hors de ce dépôt, à faire dans les 3 dépôts frères pour les rapports Allure :
1. Créer les secrets `ALLURE_APP_ID` / `ALLURE_APP_PRIVATE_KEY` dans `ami-system-tests`.
2. Ajouter `pull-requests: write` sur les 3 dépôts frères à l'App GitHub existante.
3. Passer `source_repo` + `pr_number` au dispatch de `system-tests-E2E.yml`.
4. Brancher un dispatch de `allure-cleanup.yml` sur leur job existant `pull_request: closed`.

## Notes

- Le remote GitHub du dépôt est `numerique-gouv/ami-system-tests` (le nom du dépôt local,
  `ami-tests-e2e`, diffère du nom du dépôt distant).
- Ce dépôt est **privé** — minutes de runner et stockage d'artifacts sont décomptés d'un quota
  gratuit puis facturés au-delà, pas gratuits/illimités comme sur un dépôt public.
- `workflow_dispatch` n'apparaît dans l'onglet Actions que si le fichier existe sur la branche
  par défaut (`main`) — invisible tant que la branche de travail n'est pas mergée.
- Commande de test local de référence (limites ci-dessus comprises) :
  `act workflow_dispatch -W .github/workflows/system-tests-E2E.yml --container-architecture linux/amd64 --input ref_name=staging --input run_android=true`.
