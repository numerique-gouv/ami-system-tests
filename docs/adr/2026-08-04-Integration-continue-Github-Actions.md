# Intégration continue — point d'entrée manuel Notification API (webapp / Android / iOS)

## Problème

Le dépôt ne contenait aucun `.github/workflows/` : il n'existait aucun moyen déclenché depuis
GitHub de lancer les suites E2E (webapp, Android, iOS) contre un environnement donné (`staging`
ou une review app Scalingo identifiée par un numéro de PR). Toute exécution passait par `just`
en local.

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

## Décision

Un workflow parent `workflow_dispatch`, **`notification-api.pr.yml`**, expose 5 inputs :
`ref_name` (nom de branche/environnement, mappé sur `AMI_ENV`, défaut `staging`), `run_webapp`,
`run_android`, `run_ios` (booléens, défaut `false` — rien ne part sans déclenchement explicite),
et `run_old_device` (booléen, défaut `true`, ne s'applique qu'à la suite Android).

Chacune des trois suites est un **workflow réutilisable** (`workflow_call`) séparé et symétrique,
appelé en parallèle (pas de `needs:` entre eux) :
- `notification-api.webapp.yml` — `ubuntu-latest`, exécute réellement `just test-web-suite all`
  (stub côté justfile pour l'instant).
- `notification-api.android.yml` — `ubuntu-latest`, boote un émulateur réel et lance
  `just test-android-suite all`.
- `notification-api.ios.yml` — `macos-latest`, encore au stade stub (« hello world » + inputs),
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

## Statut

Accepté pour l'architecture (parent + workflows réutilisables symétriques, injection de
secrets par `environment:`, appareil Android unique par run). Travaux restants, hors périmètre
de cette ADR :
- Suite webapp réelle (actuellement un stub `just test-web-suite`).
- Récupération de l'APK/IPA depuis les workflows des dépôts frères (`ami-app-android`,
  `ami-app-ios`) — aucun mécanisme de récupération d'artefact cross-repo n'est encore défini.
- Développement du workflow iOS au-delà du stub (simulateur, coût macOS assumé au moment venu).

## Notes

- Le remote GitHub du dépôt est `numerique-gouv/ami-system-tests` (le nom du dépôt local,
  `ami-tests-e2e`, diffère du nom du dépôt distant).
- `workflow_dispatch` n'apparaît dans l'onglet Actions que si le fichier existe sur la branche
  par défaut (`main`) — invisible tant que la branche de travail n'est pas mergée.
- Commande de test local de référence (limites ci-dessus comprises) :
  `act workflow_dispatch -W .github/workflows/notification-api.pr.yml --container-architecture linux/amd64 --input ref_name=staging --input run_android=true`.
