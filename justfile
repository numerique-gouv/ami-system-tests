# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 22.19 (README, « Prérequis »)

# Convention des arguments (pas de complétion shell sur mesure : `just <Tab>` complète les NOMS de recettes, avec leur commentaire) :
# - la cible (webapp | android | ios) est dans le NOM de la recette (test-android, explore-ios, debug-webapp…) ;
# - les recettes de test sont fines : tout (--suite, --spec…) est transmis à wdio tel quel ; l'appareil visé se choisit par variables d'environnement
#   (ANDROID_UDID, IOS_UDID : gabarit .env, README « Prérequis »), jamais par une option ;
# - un argument obligatoire ou deux : positionnels ; un drapeau booléen est toujours nommé (`--page-objects`).
# `just --list` et la complétion n'affichent qu'UNE ligne par recette : l'attribut `[doc("Rôle · arguments")]` quand
# la recette a des options, sinon la DERNIÈRE ligne de commentaire. Les exemples restent en commentaires
# (lisibles dans ce fichier : `just --show` les masque dès qu'un `[doc]` est présent) ; arguments d'une recette : `just --usage <recette>`.

# Fichier d'environnement : `.env` par défaut (WDIO le charge aussi seul, sans just), ou celui choisi par l'option native `just -E <fichier>`
# (`--dotenv-path`), ex. `just -E .env.preprod test-ios --suite mobile_all` (convention `.env.<cible>`, tous ignorés par git ; README).
# Les variables absentes du fichier choisi sont complétées par `.env` (WDIO le charge sans écraser) ; le shell l'emporte sur les fichiers.
set dotenv-load

# ─── Qualité ────────────────────────────────────────────────────────────────

# Vérifications statiques : lint + typecheck (sans lancer les tests)
check-code:
    npm run lint
    npm run typecheck

# ─── Appareils virtuels ─────────────────────────────────────────────────────
# Les tests ne démarrent jamais d'appareil : on le lance avant (`just start`), on le désigne par son UDID (ANDROID_UDID / IOS_UDID, gabarit .env),
# on l'éteint après (`just stop`). SDK Android : ANDROID_HOME, sinon l'emplacement par défaut de macOS.
android_sdk := env("ANDROID_HOME", env("HOME") + "/Library/Android/sdk")

# Exemple : just start   |   just start Pixel_modern   |   just start "iPhone 17 Pro"   (un morceau du nom suffit, ou l'UDID iOS)
# Sans argument : liste ce qui est démarrable (AVD Android, simulateurs iOS). Avec un argument : démarre l'appareil et affiche son UDID
# (Android : emulator-<port>, premier port pair libre à partir de 5554 ; iOS : l'UUID du simulateur). Plusieurs correspondances : la liste est affichée.
[doc("Démarre un appareil virtuel et affiche son UDID · [NOM]")]
[positional-arguments]
start name="":
    #!/usr/bin/env bash
    set -euo pipefail
    name="$1"
    adb="{{android_sdk}}/platform-tools/adb"
    emulator="{{android_sdk}}/emulator/emulator"
    # « ios  nom [runtime]  udid » à partir de `xcrun simctl list devices` (les simulateurs temporaires d'Appium sont ignorés)
    ios_lines() {
      awk '/^-- .* --$/ {rt = $2 " " $3} /\([0-9A-F-]{36}\)/ && !/appiumTest/ {l = $0; sub(/^ +/, "", l); match(l, /\([0-9A-F-]{36}\)/); print "ios      " substr(l, 1, RSTART - 2) " [" rt "]  " substr(l, RSTART + 1, 36)}'
    }
    # « type  nom  [udid] », une ligne par appareil démarrable
    startable() {
      "$emulator" -list-avds | grep . | sed 's/^/android  /' || true
      xcrun simctl list devices available | ios_lines
    }
    if [ -z "$name" ]; then startable; exit 0; fi
    matches=$(startable | grep -iF -- "$name" || true)
    count=$(printf '%s\n' "$matches" | grep -c . || true)
    if [ "$count" -eq 0 ]; then echo "Aucun appareil ne correspond à « $name » (just start : la liste)." >&2; exit 1; fi
    if [ "$count" -gt 1 ]; then echo "Plusieurs appareils correspondent, précisez le nom ou donnez l'UDID :" >&2; echo "$matches" >&2; exit 1; fi
    if [ "$(echo "$matches" | awk '{print $1}')" = android ]; then
      avd=$(echo "$matches" | awk '{print $2}')
      port=5554
      while "$adb" devices | grep -q "emulator-$port"; do port=$((port + 2)); done
      nohup "$emulator" -avd "$avd" -port "$port" > /dev/null 2>&1 &
      serial="emulator-$port"
      for _ in $(seq 1 90); do
        [ "$("$adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && { echo "$serial"; exit 0; }
        sleep 2
      done
      echo "$avd n'a pas fini de démarrer après 3 minutes ($serial)." >&2; exit 1
    else
      udid=$(echo "$matches" | awk '{print $NF}')
      xcrun simctl bootstatus "$udid" -b > /dev/null
      echo "$udid"
    fi

# Exemple : just stop   |   just stop Pixel_modern   |   just stop emulator-5554   |   just stop "iPhone 17 Pro"
# Sans argument : liste les appareils virtuels démarrés (Android et iOS). Avec un argument (nom, un morceau du nom ou UDID) : éteint celui-là.
# Un simulateur n'est jamais supprimé, seulement éteint.
[doc("Éteint un appareil virtuel démarré · [NOM]")]
[positional-arguments]
stop name="":
    #!/usr/bin/env bash
    set -euo pipefail
    name="$1"
    adb="{{android_sdk}}/platform-tools/adb"
    # « type  nom  udid », une ligne par appareil virtuel démarré
    running() {
      "$adb" devices | awk '/^emulator-/ && $2 == "device" {print $1}' | while read -r serial; do
        # nom de l'AVD : propriété de l'émulateur (images récentes : ro.boot.qemu.avd_name, anciennes : ro.kernel.qemu.avd_name)
        avd=$("$adb" -s "$serial" shell getprop ro.boot.qemu.avd_name | tr -d '\r')
        [ -n "$avd" ] || avd=$("$adb" -s "$serial" shell getprop ro.kernel.qemu.avd_name | tr -d '\r')
        echo "android  $avd  $serial"
      done
      xcrun simctl list devices booted | awk '/^-- .* --$/ {rt = $2 " " $3} /\([0-9A-F-]{36}\)/ {l = $0; sub(/^ +/, "", l); match(l, /\([0-9A-F-]{36}\)/); print "ios      " substr(l, 1, RSTART - 2) " [" rt "]  " substr(l, RSTART + 1, 36)}'
    }
    if [ -z "$name" ]; then running; exit 0; fi
    matches=$(running | grep -iF -- "$name" || true)
    count=$(printf '%s\n' "$matches" | grep -c . || true)
    if [ "$count" -eq 0 ]; then echo "Aucun appareil démarré ne correspond à « $name » (just stop : la liste)." >&2; exit 1; fi
    if [ "$count" -gt 1 ]; then echo "Plusieurs appareils correspondent, précisez le nom ou donnez l'UDID :" >&2; echo "$matches" >&2; exit 1; fi
    udid=$(echo "$matches" | awk '{print $NF}')
    if [ "$(echo "$matches" | awk '{print $1}')" = android ]; then "$adb" -s "$udid" emu kill > /dev/null; else xcrun simctl shutdown "$udid"; fi
    echo "arrêté : $matches"

# ─── Tests ──────────────────────────────────────────────────────────────────
# Les recettes de test sont fines : tout ce qu'elles ne lisent pas est transmis tel quel à wdio.
#   just test-android                                        → tous les tests (une session par fichier)
#   just test-android --suite mobile_smoke                   → suite nommée (mobile_short = authentification seule, mobile_smoke, mobile_all)
#   just test-android --spec "src/tests/mobile/home*"        → un ou plusieurs fichiers (--spec répétable)
#   ANDROID_UDID=emulator-5560 just test-android --suite mobile_all   → appareil précis (variables d'appareil : gabarit .env)
#   just test-webci --suite webapp_smoke                     → idem webapp (webapp_short | webapp_smoke | webapp_usage | webapp_all)
# Les suites nommées sont définies dans l'option native `suites` de wdio.base.conf.ts (appel sans just :
# npx wdio run wdio.webapp.conf.ts --suite webapp_smoke). Les apps mobiles testées sont celles de ANDROID_APP_PATH / IOS_APP_PATH
# (gabarit .env.example). Le fichier d'environnement est .env, ou `just -E .env.preprod test-… ` (cf. README).
# Relances de specs : specFileRetries = 0 en local (mesures comprises), 1 en CI (CI=true) ; forcer par WDIO_SPEC_FILE_RETRIES=N ou --specFileRetries=N.

# L'appareil n'est PAS démarré par la recette : il tourne déjà (Android Studio, ou `emulator -avd <nom> -port 5560`, cf. `adb devices`).
# ANDROID_UDID vise un appareil précis (second émulateur en parallèle).
# Exemple : just test-android --suite mobile_short   |   ANDROID_UDID=emulator-5560 just test-android --spec "src/tests/mobile/notifications*"
[doc("Tests E2E Android · [--suite NOM | --spec GLOB…] (tout va à wdio)")]
[positional-arguments]
test-android *args:
    npm run test:android -- "$@"

# Le simulateur n'est PAS démarré par la recette : XCUITest démarre celui de IOS_UDID s'il est arrêté (`xcrun simctl list devices`).
# Exemple : IOS_UDID=<udid> just test-ios --suite mobile_smoke
[doc("Tests E2E iOS · [--suite NOM | --spec GLOB…] (tout va à wdio)")]
[positional-arguments]
test-ios *args:
    npm run test:ios -- "$@"

# Exemple : AMI_ENV=staging just test-webci --suite webapp_smoke   |   just test-webci --spec "src/tests/webapp/agenda*"
# Tests E2E webapp (CI) : Chrome headless, pas d'émulateur/simulateur ; les arguments (--suite, --spec) vont à wdio.
[positional-arguments]
test-webci *args:
    npm run test:webapp -- "$@"

# ATTENTION : ne pas ouvrir le panneau DevTools (F12 / Cmd+Opt+I) sur l'onglet de l'app pendant
# le run — si un breakpoint est actif ou "Pause on exceptions" activé, le débogueur JS suspend
# réellement l'exécution de la page, ce qui bloque toute commande WebDriver (échoue au bout de
# 20s avec un message explicite plutôt qu'un hang silencieux, cf. ENSURE_APP_WINDOW_TIMEOUT_MS
# dans src/platform/browser.adapter.ts).
# Exemple : just test-webapp --spec "src/tests/webapp/agenda*"   |   just test-webapp --suite webapp_usage
# Tests E2E webapp avec un Chrome dédié visible (headed), lancé par WDIO/Chromedriver ; les arguments (--suite, --spec) vont à wdio.
[positional-arguments]
test-webapp *args:
    WEBAPP_HEADLESS=false npm run test:webapp -- "$@"

# Exemple : just test-webvideo --spec src/tests/webapp/nonreg/consentement-demarches.usage.test.ts
# Tests webapp (headless) avec la config DevTools « vidéo » (wdio.webapp.with_video.conf.ts) : une vidéo .webm par test, réussi ou non,
# plus la trace rejouable avec `npx show-trace` (cf. README). Fichiers dans test-results/traces/<horodatage>_webapp_<spec>/test-results/
# (chemin affiché à la fin). Au moins un argument est exigé (--spec GLOB) : la vidéo ralentit le run, on ne filme pas toute la suite.
[doc("Tests webapp avec la config DevTools vidéo · --spec GLOB… (le reste va à wdio)")]
[positional-arguments]
test-webvideo +args:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🎬 Tests E2E webapp (headless, vidéo DevTools)…"
    WEBAPP_HEADLESS=true npx wdio run wdio.webapp.with_video.conf.ts "$@" || status=$?
    echo "📼 Vidéos :"; find test-results/traces -name 'video-*.webm' -newermt '-1 hour' 2>/dev/null | sort | tail -5
    exit "${status:-0}"

# ─── Exploration et débogage (wdio session, WebdriverIO 10) ─────────────────
# Une session `wdio session` survit à la commande qui l'a ouverte (arrêt après 30 min d'inactivité) : on enchaîne
# de petites commandes. Cycle : explore → snapshot → actions → explore-export → test. Voir
# `.claude/skills/wdio-session/SKILL.md` et `docs/process/migration-wdio-10.md` §4.

# Usage : just explore-webapp   |   just explore-webapp "/#/agenda"
# Ouvre une session d'exploration sur la webapp (Chrome headless) de l'environnement AMI_ENV et navigue vers une route (hash de la SPA, entre
# guillemets). Pose d'abord le cookie `access_key` comme wdio.webapp.conf.ts (valeur de WEB_APP_ACCESS_KEYS, jamais affichée).
[doc("Session d'exploration webapp (Chrome headless) · [ROUTE]")]
explore-webapp route="/":
    #!/usr/bin/env bash
    set -euo pipefail
    : "${WEB_APP_ACCESS_KEYS:?WEB_APP_ACCESS_KEYS absente (gabarit .env)}"
    origin="$(npx ts-node -T --project tsconfig.json -e "console.log(require('./src/helpers/common/environment').resolveEnvironment().webappUrl)")"
    npx wdio session -s webapp open chrome "$origin/favicon.ico" --replace --no-snapshot --launch-timeout 240000
    npx wdio session -s webapp exec -e 'await browser.setCookies({name: "access_key", value: process.env.WEB_APP_ACCESS_KEYS, expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 3600})'
    npx wdio session -s webapp navigate "$origin{{ route }}"

# Usage : just explore-android
# Ouvre une session d'exploration sur l'app Android de ANDROID_APP_PATH (émulateur déjà démarré, par Android Studio par exemple), sans réinitialiser l'app.
# L'app apparaît d'abord sur le sélecteur d'environnement (écran natif, sans WebView) ; la SPA est ensuite dans une WebView (à inspecter avec les DevTools).
# En Android hybride, `snapshot` lit l'arbre natif (et plante après `contexts switch`, WDIO 10.0.1) : DevTools pour le DOM de la WebView. Appareil précis : ANDROID_UDID.
[doc("Session d'exploration Android (app de ANDROID_APP_PATH)")]
explore-android:
    #!/usr/bin/env bash
    set -euo pipefail
    app="${ANDROID_APP_PATH:?ANDROID_APP_PATH absente (gabarit .env)}"
    npx wdio session -s android open android --app "${app/#\~/$HOME}" ${ANDROID_UDID:+--udid "$ANDROID_UDID"} --no-reset --replace --launch-timeout 240000 < /dev/null

# Usage : just explore-ios   |   IOS_UDID=<udid> just explore-ios
# Ouvre une session d'exploration sur l'app iOS de IOS_APP_PATH (simulateur déjà démarré, par Xcode par exemple ; IOS_UDID le désigne), sans réinitialiser l'app.
[doc("Session d'exploration iOS (app de IOS_APP_PATH)")]
explore-ios:
    #!/usr/bin/env bash
    set -euo pipefail
    app="${IOS_APP_PATH:?IOS_APP_PATH absente (gabarit .env)}"
    npx wdio session -s ios open ios --app "${app/#\~/$HOME}" ${IOS_UDID:+--udid "$IOS_UDID"} --no-reset --replace --launch-timeout 300000 < /dev/null

# Exemples : just s webapp click e3   |   just s webapp fill e4 "Passeport biométrique"   |   just s debug-0-0 snapshot -i
# Lance une action `wdio session` sur la session d'une cible, ou sur un test en pause (debug-0-0).
[positional-arguments]
s target *args:
    #!/usr/bin/env bash
    set -euo pipefail
    t="$1"; shift
    npx wdio session -s "$t" "$@"

# À relire puis ranger dans un Page Object et src/tests/<domaine>/ (cf. CONTRIBUTING.md).
# Exemples : just explore-export agenda-evenements webapp   →   exports/agenda-evenements.e2e.ts
#            just explore-export agenda-evenements webapp --page-objects   →   + exports/pageobjects/*.page.ts
# Écrit les étapes de la session en spec Mocha (code WDIO réellement exécuté, sélecteurs stables).
# Avec --page-objects, génère aussi une classe par page (un getter par élément, nommée d'après les éléments) : un brouillon,
# qui garde les sélecteurs dans la page et non dans src/pages/locators/ comme le veut le projet.
[doc("Étapes de la session en spec Mocha dans exports/ · NOM [CIBLE] [--page-objects]")]
[arg("page_objects", long="page-objects", value="--page-objects", help="Génère aussi des Page Objects (brouillon) dans exports/pageobjects/")]
explore-export name target="webapp" page_objects="":
    mkdir -p exports
    npx wdio session -s {{ target }} export --out exports/{{ name }}.e2e.ts --title "{{ name }}" {{ page_objects }}
    @echo "→ exports/{{ name }}.e2e.ts"

# Ferme la session d'une cible.
explore-close target="webapp":
    npx wdio session -s {{ target }} close

# Usage : just debug-webapp src/tests/webapp/agenda.parcours.test.ts
# Lance un test webapp et le MET EN PAUSE à son premier échec de test (session « debug-0-0 »). Un échec de hook (`before all`) ne déclenche pas
# la pause. Depuis un autre terminal : just s debug-0-0 snapshot -i, just s debug-0-0 screenshot, just s debug-0-0 resume.
# Mobile : npx wdio run wdio.android.conf.ts --spec <fichier> --debug=agent (idem wdio.ios.conf.ts, avec l'appareil démarré) ; sessions ouvertes : npx wdio session list.
[doc("Test webapp en pause au premier échec (session debug-0-0) · FICHIER")]
debug-webapp spec:
    npx wdio run wdio.webapp.conf.ts --spec {{ spec }} --debug=agent

# Les croix « cloud » (BrowserStack…) et « desktop » (windows, mac2) ne nous concernent pas.
# Exemples : just doctor   |   just doctor android
# Diagnostic de l'environnement : Node, navigateurs, Appium et drivers, SDK Android, simulateurs.
doctor target="":
    #!/usr/bin/env bash
    npx wdio session doctor {{ target }} || echo "→ Les ✖ cloud (BrowserStack…) et desktop (mac2, windows) sont sans objet ici ; seuls node, appium, android-sdk et simctl comptent."

# Pour chaque test : plateforme, appareil, étapes, erreur (message complet, 12 lignes au plus), URL (jetons masqués), lien Sentry de la SPA
# (context.json de chaque dossier) et chemin du transcript.md de sa trace (src/scripts/failures-text.ts).
# Captures, arbre de l'écran et réseau : traces du service DevTools, une par test et par run, dans
# test-results/traces/<horodatage>_<plateforme>_<suite ou spec>/test-results/ (just failures-ui pour les ouvrir). Les dumps sont dans le
# sous-dossier failures/ du même run. Le résumé passants/cassés (JUnit XML, un fichier par run) est dans test-results/junit/.
# DOSSIER : un dossier de dumps, un dossier de run, ou tout dossier qui en contient (ex. l'artefact d'un run de CI téléchargé).
# Exemples : just failures-text   |   just failures-text test-results/traces/2026-10-12T14-06-09-523Z_webapp_aide-contact   |   just failures-text temp/test-results-pr1275
[doc("Lister les tests en échec du dernier run · [DOSSIER]")]
failures-text dir="":
    npx ts-node --project tsconfig.json src/scripts/failures-text.ts {{ dir }}

# Pendant visuel de `just failures-text` : ouvre dans le lecteur DevTools (captures, arbre de l'écran, réseau) la trace d'un test en échec.
# Les traces ne sont gardées que pour les tests en échec ou rejoués : toute trace d'un run est donc celle d'un échec.
# CIBLE : un dossier de run, l'artefact d'une CI téléchargé, le dossier d'une trace (celui qui contient trace.trace) ou un .zip ; sans CIBLE, le
# dernier run qui a des traces. Si la cible en contient plusieurs, la recette les liste ; FILTRE (sous-chaîne du chemin, donc du nom du test)
# en désigne une. Détail et raison du zip à la volée : src/scripts/failures-ui.ts.
# Exemples : just failures-ui   |   just failures-ui "" agenda   |   just failures-ui test-results/traces/2026-10-12T14-06-09-523Z_webapp_aide-contact
[doc("Ouvrir dans DevTools la trace d'un test en échec · [CIBLE] [FILTRE]")]
failures-ui target="" filter="":
    npx ts-node --project tsconfig.json src/scripts/failures-ui.ts "{{ target }}" "{{ filter }}"

# Supprime les données produites par les tests et l'exploration : `.wdio` (sessions `wdio session`, snapshots), `.wdio-logs` et le CONTENU de
# `test-results/` (traces, vidéos, dumps d'échec, JUnit). Les dossiers eux-mêmes sont conservés ; tout est régénéré au prochain run.
# Perdu définitivement : les traces/vidéos à consulter (`just failures-text`) et les sessions d'exploration ouvertes
# (`npx wdio session list`). Refuse de tourner pendant un `wdio run` : supprimer `test-results/` en plein run le corromprait.
# Exemple : just clean-tests-data
[doc("Supprimer .wdio, .wdio-logs et test-results/*")]
clean-tests-data:
    #!/usr/bin/env bash
    set -euo pipefail
    if pgrep -f "wdio run" >/dev/null 2>&1; then
        echo "❌ Un run WDIO est en cours : attendez sa fin avant de nettoyer." >&2
        exit 1
    fi
    for dir in .wdio .wdio-logs test-results; do
        if [ -e "$dir" ]; then printf '🗑  %-13s %s\n' "$dir" "$(du -sh "$dir" | cut -f1)"; else printf '·  %-13s (absent)\n' "$dir"; fi
    done
    rm -rf .wdio .wdio-logs
    [ ! -d test-results ] || find test-results -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    echo "✅ Données de tests supprimées."
