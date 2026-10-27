# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

# Convention des arguments (pas de complétion shell sur mesure : `just <Tab>` complète les NOMS de recettes, avec leur commentaire) :
# - 1 ou 2 arguments obligatoires, ou un argument variadique : positionnels ;
# - la cible (webapp | android | ios) est dans le NOM de la recette (test-android, explore-ios, debug-webapp…), comme pour les tests ;
# - 3 arguments ou plus : nommés avec `[arg("x", long="x")]` ; un drapeau booléen est toujours nommé (`--debug`) ;
# - 2 ou 3 optionnels : on nomme dès qu'il faudrait donner un argument juste pour atteindre le suivant.
# `just --list` et la complétion n'affichent qu'UNE ligne par recette : l'attribut `[doc("Rôle · [--device AVD] [GLOB…]")]` quand
# la recette a des options (rôle, puis arguments), sinon la DERNIÈRE ligne de commentaire. Les exemples restent en commentaires
# (lisibles dans ce fichier : `just --show` les masque dès qu'un `[doc]` est présent) et le détail des arguments est dans
# `just --usage <recette>` (rappelé par `just help`).

set dotenv-path := ".env.local"
# `just` interdit les settings booléens calculés (voir doc `set`), donc ce flag ne peut pas
# être conditionné sur CI/GITHUB_ACTIONS ici. Le caractère obligatoire de .env.local en dev
# local est réimplémenté par la recette de garde `_require-dotenv` ci-dessous.
set dotenv-required := false

# ─── Variables ──────────────────────────────────────────────────────────────

# Fixe APPIUM_HOME hors du projet : sans ça, Appium (devDependency locale) bascule en mode
# "APPIUM_HOME projet" (node_modules/.cache/appium) et fige des chemins absolus qui deviennent
# invalides au moindre déplacement/reclonage du repo.
export APPIUM_HOME := env_var_or_default("APPIUM_HOME", env_var("HOME") / ".appium")

android_project := "../ami-app-android"
ios_project     := "../ami-app-ios"

# AMI_ENV=preprod (.env.local) → builds préprod ; sinon staging (review apps PR comprises).
preprod     := if env_var_or_default("AMI_ENV", "") =~ "(?i)preprod" { "1" } else { "" }
app_id      := if preprod == "1" { "fr.gouv.ami.preprod" } else { "fr.gouv.ami.staging" }
ios_bundle  := if preprod == "1" { "fr.gouv.ami.preproduction" } else { "fr.gouv.ami.staging" }
android_flavor := if preprod == "1" { "preprod" } else { "staging" }
# Constructeur : ./gradlew assemble{{ if preprod == "1" { "Preprod" } else { "Staging" } }}Debug | assemblePreprodDebug
android_apk := android_project / "app/build/outputs/apk" / android_flavor / "debug/app-" + android_flavor + "-debug.apk"
# Le projet iOS construit avec -derivedDataPath ../build depuis ami-app-ios/, donc à côté
# de ami-app-ios/ (sibling sous ami/), pas dans ami-app-ios/build/.
ios_derived := "../build"
# Scheme AMI-Preproduction → AMI-Preproduction.app ; le staging local garde son nom historique AMI-Production.app.
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator" / (if preprod == "1" { "AMI-Preproduction.app" } else { "AMI-Production.app" })

# Appareil visé = `--device` (ex. just test-android --device pixel_2_api30). Sans `--device`, on prend
# l'appareil déjà connecté (adb : émulateur ou téléphone) ou le simulateur iOS déjà démarré ; s'il n'y en a
# aucun, on démarre celui de ANDROID_DEVICE_NAME_DEFAULT / IOS_DEVICE_NAME_DEFAULT (.env.local, propres au
# poste : aucune valeur en dur dans le dépôt). Les recettes exportent ensuite ANDROID_DEVICE_NAME /
# IOS_DEVICE_NAME, que lit src/driver/capabilities.ts : l'appareil démarré (start-*) et celui visé par Appium
# sont ainsi le même.
android_default_device := env_var_or_default("ANDROID_DEVICE_NAME_DEFAULT", "")
android_sdk := env_var_or_default("ANDROID_SDK_ROOT", env_var_or_default("ANDROID_HOME", ""))

# Nom du simulateur iOS tel qu'attendu par xcrun simctl (espaces, pas tirets). Le nom doit être unique parmi
# les simulateurs installés : il désigne aussi le runtime iOS (pas de version à donner).
# (iOS physique non géré : wdio.ios.conf.ts et l'app buildée visent un simulateur.)
ios_default_device := env_var_or_default("IOS_DEVICE_NAME_DEFAULT", "")

# ─── Setup ──────────────────────────────────────────────────────────────────

# Vérifier que les outils nécessaires sont installés
check:
    @echo "🔍 Vérification des pré-requis…"
    @command -v adb       > /dev/null && echo "✅ adb"       || echo "❌ adb manquant (Android SDK)"
    @command -v xcodegen  > /dev/null && echo "✅ xcodegen"  || echo "❌ xcodegen manquant (brew install xcodegen)"
    @command -v node      > /dev/null && echo "✅ node"      || echo "❌ node manquant"
    @(command -v appium > /dev/null || [ -f node_modules/.bin/appium ]) && echo "✅ appium" || echo "❌ appium manquant (npm install)"
    @command -v just      > /dev/null && echo "✅ just"      || echo "❌ just manquant"

# Passer par cette recette (plutôt que `npm run appium:install` en direct) garantit que l'install et le
# `just test-android`/`test-ios` qui suivra utilisent le même APPIUM_HOME.
# Installer les drivers Appium sous le APPIUM_HOME du projet (cf. variable ci-dessus).
# Piège : après `npm install` ou `appium driver update`, les liens symboliques `appium` dans ~/.appium/node_modules/appium-*-driver/node_modules
# disparaissent et les pilotes ne se chargent plus (« Could not find a driver », « Cannot find package 'appium' »). Remède : `appium driver uninstall`
# puis `install` des deux pilotes (APPIUM_HOME=~/.appium), donc cette recette après désinstallation ; à refaire après toute mise à jour des pilotes.
install-appium-drivers:
    @echo "📥 Installation des drivers Appium…"
    npm run appium:install || true
    npx appium driver list --installed || true

# Installer les dépendances Node et les drivers Appium
setup:
    @echo "📥 Installation des dépendances…"
    npm install
    just install-appium-drivers
    @echo "✅ Setup terminé. Lance 'just test-android' ou 'just test-ios'."

# Repartir d'un node_modules propre, strictement conforme au lockfile
clean-install:
    @echo "🧹 Suppression de node_modules…"
    rm -rf node_modules
    @echo "📥 Réinstallation stricte depuis package-lock.json…"
    npm ci
    just install-appium-drivers
    @echo "✅ node_modules reconstruit."

# Afficher les dépendances dépassées (sans modifier package.json)
check-deps:
    npx npm-check-updates

# Généralement, le cocktail de mise à jour crée un jeu de versions incompatibles entre elles : ce script est souvent à terminer à la main.
# npm doit être configuré avec un cooldown de 14 jours (cat $HOME/.npmrc : min-release-age=14).
# Appium ne connaît pas ce concept : on peut le mettre à jour en annulant le cooldown : npm_config_min_release_age=0 npm run appium:update
# Mettre à jour package.json vers les dernières versions puis réinstaller.
upgrade:
    npx npm-check-updates --upgrade
    @just setup
    @echo "📥 Mise à jour des drivers Appium (uiautomator2 + xcuitest)…"
    npm run appium:update || true

# ─── Build ──────────────────────────────────────────────────────────────────

# Vérifier que l'APK Android existe (builder depuis le projet ami-app-android)
build-android:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -f "{{android_apk}}" ]; then
        echo "✅ APK trouvé : {{android_apk}}"
    else
        echo "❌ APK introuvable : {{android_apk}}"
        echo "   → Lance le build depuis le projet mobile : cd {{android_project}} && ./gradlew assemble{{ if preprod == "1" { "Preprod" } else { "Staging" } }}Debug"
        exit 1
    fi

# Vérifier que l'app iOS existe (builder depuis le projet ami-app-ios)
build-ios:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -d "{{ios_app}}" ]; then
        echo "✅ App iOS trouvée : {{ios_app}}"
    else
        echo "❌ App iOS introuvable : {{ios_app}}"
        echo "   → Lance le build depuis le projet mobile : cd {{ios_project}} && just build-staging (ou xcodebuild -scheme {{ if preprod == "1" { "AMI-Preproduction" } else { "AMI-Staging" } }} -configuration Debug -destination \"generic/platform=iOS Simulator\" -derivedDataPath ../build build)"
        exit 1
    fi

# ─── Émulateurs / Simulateurs ───────────────────────────────────────────────

# Si un émulateur est déjà actif (quelle que soit sa provenance), on le réutilise.
# Attend que UiAutomation soit disponible (sys.boot_completed + package manager prêt).
# Exemple : just start-android   |   just start-android --device pixel_2_api30
# Affiche le numéro de série (adb) de l'appareil Android visé, vide s'il n'est pas connecté : celui dont l'AVD, le
# modèle ou le numéro de série vaut l'argument, ou le premier appareil connecté si l'argument est vide.
_android-udid device="":
    #!/usr/bin/env bash
    set -uo pipefail
    ADB="{{ android_sdk }}/platform-tools/adb"
    [ -x "$ADB" ] || ADB="$(command -v adb || true)"
    [ -n "$ADB" ] || exit 0
    for serial in $("$ADB" devices 2>/dev/null | awk '/\tdevice$/{print $1}'); do
        case "$serial" in
          emulator-*) name="$("$ADB" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')" ;;
          *) name="$("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')" ;;
        esac
        if [ -z "{{ device }}" ] || [ "$name" = "{{ device }}" ] || [ "$serial" = "{{ device }}" ]; then
            echo "$serial"
            exit 0
        fi
    done

[doc("Démarrer l'émulateur Android · [--device AVD]")]
[arg("device", long="device", help="AVD, modèle ou numéro de série visé. Défaut : l'appareil Android connecté (adb), sinon ANDROID_DEVICE_NAME_DEFAULT (.env.local)")]
start-android device="":
    #!/usr/bin/env bash
    set -euo pipefail
    ADB="{{ android_sdk }}/platform-tools/adb"
    EMU="{{ android_sdk }}/emulator/emulator"
    # L'appareil visé est-il déjà connecté et booté ? (--device : seulement celui-là, un autre appareil branché
    # n'est PAS pris à sa place ; sans --device : le premier appareil connecté.)
    UDID="$(just --quiet _android-udid "{{ device }}")"
    if [ -n "$UDID" ]; then
        echo "✅ Appareil déjà connecté : $UDID — réutilisé."
        exit 0
    fi
    AVD="{{ if device == "" { android_default_device } else { device } }}"
    [ -n "$AVD" ] || { echo "❌ Aucun appareil Android connecté : donner --device <avd> ou définir ANDROID_DEVICE_NAME_DEFAULT dans .env.local." >&2; exit 1; }
    "$EMU" -list-avds 2>/dev/null | grep -qx "$AVD" || { echo "❌ Appareil « $AVD » introuvable : ni connecté (adb), ni AVD (voir : just devices)." >&2; exit 1; }
    echo "🤖 Démarrage de l'émulateur ${AVD}…"
    "$EMU" -avd "$AVD" -no-snapshot-save &
    # Un autre appareil peut être branché : on repère le nôtre par son AVD et on le vise avec -s partout.
    until UDID="$(just --quiet _android-udid "$AVD")"; [ -n "$UDID" ]; do sleep 2; done
    "$ADB" -s "$UDID" wait-for-device
    until "$ADB" -s "$UDID" shell getprop sys.boot_completed 2>/dev/null | grep -q '^1$'; do sleep 2; done
    # Attendre que le package manager soit opérationnel (requis par UiAutomator2)
    until "$ADB" -s "$UDID" shell pm list packages > /dev/null 2>&1; do sleep 1; done
    # Déverrouiller l'écran — UiAutomation exige l'écran allumé et déverrouillé.
    # Le snapshot default_boot peut charger avec l'écran verrouillé.
    "$ADB" -s "$UDID" shell input keyevent 82   # KEYCODE_MENU : réveille l'écran
    "$ADB" -s "$UDID" shell input keyevent 4    # KEYCODE_BACK  : ferme tout dialog éventuel
    "$ADB" -s "$UDID" shell input keyevent 3    # KEYCODE_HOME : accueil launcher (pas d'app ouverte)
    sleep 2
    echo "✅ Émulateur prêt ($UDID)."

# Arrêter l'émulateur Android
stop-android:
    {{android_sdk}}/platform-tools/adb emu kill || true

# Exemple : just start-ios --device "iPhone 17 Pro"
# Affiche le simulateur iOS visé : l'argument s'il est donné, sinon le premier simulateur démarré, sinon le défaut.
_ios-device device="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "{{ device }}" ]; then echo "{{ device }}"; exit 0; fi
    booted="$(xcrun simctl list devices booted | sed -nE 's/^ +(.+) \([0-9A-Fa-f-]{36}\) \(Booted\).*/\1/p' | head -1 || true)"
    name="${booted:-{{ ios_default_device }}}"
    [ -n "$name" ] || { echo "❌ Aucun simulateur iOS démarré : donner --device <nom> ou définir IOS_DEVICE_NAME_DEFAULT dans .env.local." >&2; exit 1; }
    echo "$name"

# Affiche l'identifiant (UDID) du simulateur iOS de ce nom, vide s'il n'existe pas ; le simulateur démarré l'emporte si plusieurs
# runtimes portent le même nom. Viser l'UDID évite qu'Appium, sans version d'iOS, crée un simulateur temporaire (appiumTest-…).
_ios-udid name:
    #!/usr/bin/env bash
    set -uo pipefail
    xcrun simctl list devices 2>/dev/null | awk -v name="{{ name }}" '
        match($0, /\([0-9A-Fa-f-]{36}\)/) {
            label = substr($0, 1, RSTART - 1); sub(/^ +/, "", label); sub(/ +$/, "", label)
            if (label != name) next
            uuid = substr($0, RSTART + 1, RLENGTH - 2)
            if ($0 ~ /\(Booted\)/) { booted = uuid } else if (first == "") { first = uuid }
        }
        END { print (booted != "" ? booted : first) }'

# Exemple : just start-ios   |   just start-ios --device "iPhone 17 Pro"
[doc("Démarrer le simulateur iOS · [--device NOM]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
start-ios device="":
    #!/usr/bin/env bash
    set -euo pipefail
    DEVICE="$(just --quiet _ios-device "{{ device }}")"
    if xcrun simctl list devices booted | grep -q "$DEVICE"; then
        echo "✅ Simulateur '$DEVICE' déjà démarré."
    else
        echo "📱 Démarrage du simulateur '$DEVICE'…"
        xcrun simctl boot "$DEVICE"
        until xcrun simctl list devices booted | grep -q "$DEVICE"; do sleep 1; done
        echo "✅ Simulateur prêt."
        # L'app graphique n'est ouverte qu'au démarrage du simulateur : `open` à chaque appel ajoutait une
        # fenêtre Device Hub par lancement de test.
        open -b com.apple.dt.Devices 2>/dev/null || open -a Simulator 2>/dev/null || echo "⚠️  App graphique Simulator.app/DeviceHub.app introuvable — simulateur utilisable en headless via simctl, tests non bloqués."
    fi

[doc("Arrêter le simulateur iOS · [--device NOM]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
stop-ios device="":
    #!/usr/bin/env bash
    set -euo pipefail
    DEVICE="$(just --quiet _ios-device "{{ device }}")"
    echo "🛑 Arrêt du simulateur '$DEVICE'…"
    xcrun simctl shutdown "$DEVICE" || true
    echo "✅ Simulateur arrêté."

# Arrêter tous les simulateurs
stop: stop-android (stop-ios "")

# Les outils absents (SDK Android, Xcode) sont signalés sans faire échouer la recette.
[doc("Lister émulateurs et simulateurs du poste · ● = démarré")]
devices:
    #!/usr/bin/env bash
    set -uo pipefail
    echo "🤖 Android"
    ADB="{{ android_sdk }}/platform-tools/adb"; EMU="{{ android_sdk }}/emulator/emulator"
    [ -x "$ADB" ] || ADB="$(command -v adb || true)"
    [ -x "$EMU" ] || EMU="$(command -v emulator || true)"
    running=""
    if [ -n "$ADB" ]; then
        # Appareils connectés : nom d'AVD pour un émulateur, numéro de série pour un téléphone.
        while read -r serial; do
            case "$serial" in
              emulator-*) name="$("$ADB" -s "$serial" emu avd name 2>/dev/null | head -1 | tr -d '\r')"; running="$running|$name|" ;;
              *) echo "  ● $serial (appareil physique)" ;;
            esac
        done < <("$ADB" devices 2>/dev/null | awk '/\tdevice$/{print $1}')
    else
        echo "  ⚠️  adb introuvable (Android SDK non installé ou hors PATH) : appareils connectés non détectés."
    fi
    if [ -n "$EMU" ]; then
        avds="$("$EMU" -list-avds 2>/dev/null | grep -v '^INFO' || true)"
        if [ -z "$avds" ]; then echo "  (aucun AVD)"; fi
        while read -r avd; do
            [ -n "$avd" ] || continue
            if [[ "$running" == *"|$avd|"* ]]; then echo "  ● $avd"; else echo "  ○ $avd"; fi
        done <<< "$avds"
    else
        echo "  ⚠️  emulator introuvable (Android SDK non installé ou ANDROID_SDK_ROOT absent) : AVD non listés."
    fi
    echo
    echo "🍎 iOS"
    if command -v xcrun > /dev/null 2>&1 && xcrun simctl help > /dev/null 2>&1; then
        out="$(xcrun simctl list devices available 2>/dev/null | awk '
            /^-- .* --$/ { gsub(/^-- | --$/, ""); runtime = $0; next }
            /\((Booted|Shutdown|Shutting Down|Creating)\)/ && runtime ~ /^iOS/ && $0 ~ /^ +iPhone/ {
                state = ($0 ~ /\(Booted\)/) ? "●" : "○"
                name = $0; sub(/^ +/, "", name); sub(/ \([0-9A-Fa-f-]{36}\).*/, "", name)
                printf "  %s %s  (%s)\n", state, name, runtime
            }')"
        if [ -n "$out" ]; then echo "$out"; else echo "  (aucun simulateur iOS)"; fi
    else
        echo "  ⚠️  xcrun/simctl introuvable (Xcode non installé) : simulateurs non listés."
    fi
    echo
    echo "● démarré   ○ arrêté"

# ─── Qualité ────────────────────────────────────────────────────────────────

# Vérifications statiques : lint + typecheck (sans lancer les tests)
check-code:
    npm run lint
    npm run typecheck

# ─── Tests ──────────────────────────────────────────────────────────────────
# Usage :
#   just test-android                        → tous les tests (session par fichier)
#   just test-android "src/tests/home*"      → un ou plusieurs globs de fichiers
#   just test-android-grep Notifications     → filtre par describe/it (grep Mocha, regex JS)
#   just test-android-suite mobile_all       → tous les tests mobiles (liste plate de specs : un worker par spec, comme --spec a --spec b)
#   just test-android-suite mobile_smoke     → smoke mobile (valider un déploiement) ; mobile_short = authentification seule
#   (appel natif, sans just : npx wdio run wdio.webapp.conf.ts --suite webapp_smoke ; suites définies dans wdio.base.conf.ts)

# Relances de specs : specFileRetries = 0 en local (mesures comprises), 1 en CI (CI=true) ; forcer par WDIO_SPEC_FILE_RETRIES=N ou --specFileRetries=N.
# Garde-fou : hors CI, .env.local est obligatoire (AMI_ENV, NOTIF_*).
# En CI ces variables sont injectées par le workflow via `env:` — pas de fichier requis.
_require-dotenv:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${CI:-}${GITHUB_ACTIONS:-}" ] && [ ! -f .env.local ]; then
        echo "❌ .env.local manquant — copier .env puis renseigner AMI_ENV et NOTIF_*." >&2
        exit 1
    fi

# Les globs sont optionnels (aucun = tous les tests) ; plusieurs globs possibles.
# Exemple : just test-android --device pixel_2_api30 "src/tests/mobile/notifications*"
[doc("Tests E2E Android · [--device AVD] [GLOB…]")]
[arg("device", long="device", help="AVD visé. Défaut : l'appareil Android connecté (adb), sinon ANDROID_DEVICE_NAME_DEFAULT (.env.local)")]
test-android device="" *globs="": _require-dotenv (start-android device)
    #!/usr/bin/env bash
    set -euo pipefail
    [ -z "{{ device }}" ] || export ANDROID_DEVICE_NAME="{{ device }}"
    export ANDROID_UDID="$(just --quiet _android-udid "{{ device }}")"
    echo "🤖 Tests E2E Android…"
    if [ -n "{{globs}}" ]; then
        SPEC_ARGS=""
        for glob in {{globs}}; do
            SPEC_ARGS="$SPEC_ARGS --spec $glob"
        done
        npm run test:android -- $SPEC_ARGS
    else
        npm run test:android
    fi

# Les globs sont optionnels (aucun = tous les tests) ; plusieurs globs possibles.
# Exemple : just test-ios --device "iPhone 17 Pro" "src/tests/mobile/notifications*"
[doc("Tests E2E iOS · [--device NOM] [GLOB…]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
test-ios device="" *globs="": _require-dotenv (start-ios device)
    #!/usr/bin/env bash
    set -euo pipefail
    export IOS_DEVICE_NAME="$(just --quiet _ios-device "{{ device }}")"
    export IOS_UDID="$(just --quiet _ios-udid "$IOS_DEVICE_NAME")"
    echo "🍎 Tests E2E iOS…"
    if [ -n "{{globs}}" ]; then
        SPEC_ARGS=""
        for glob in {{globs}}; do
            SPEC_ARGS="$SPEC_ARGS --spec $glob"
        done
        npm run test:ios -- $SPEC_ARGS
    else
        npm run test:ios
    fi

# Exemple : just test-android-suite mobile_all   |   just test-android-suite mobile_short --device pixel_2_api30
[doc("Tests E2E Android, suite nommée · SUITE [--device AVD]")]
[arg("device", long="device", help="AVD visé. Défaut : l'appareil Android connecté (adb), sinon ANDROID_DEVICE_NAME_DEFAULT (.env.local)")]
test-android-suite suite device="": _require-dotenv (start-android device)
    #!/usr/bin/env bash
    set -euo pipefail
    [ -z "{{ device }}" ] || export ANDROID_DEVICE_NAME="{{ device }}"
    export ANDROID_UDID="$(just --quiet _android-udid "{{ device }}")"
    npm run test:android -- --suite {{suite}}

# Exemple : just test-ios-suite mobile_smoke   |   just test-ios-suite mobile_all --device "iPhone 17 Pro"
[doc("Tests E2E iOS, suite nommée · SUITE [--device NOM]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
test-ios-suite suite device="": _require-dotenv (start-ios device)
    #!/usr/bin/env bash
    set -euo pipefail
    export IOS_DEVICE_NAME="$(just --quiet _ios-device "{{ device }}")"
    export IOS_UDID="$(just --quiet _ios-udid "$IOS_DEVICE_NAME")"
    npm run test:ios -- --suite {{suite}}

# Les globs sont optionnels (aucun = tous les tests) ; plusieurs globs possibles.
# Lancer les tests E2E webapp (CI) — Chrome headless, pas d'émulateur/simulateur à démarrer
test-webci *globs="": _require-dotenv
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🌐 Tests E2E webapp (headless)…"
    if [ -n "{{globs}}" ]; then
        SPEC_ARGS=""
        for glob in {{globs}}; do
            SPEC_ARGS="$SPEC_ARGS --spec $glob"
        done
        npm run test:webapp -- $SPEC_ARGS
    else
        npm run test:webapp
    fi

# Exemple : AMI_ENV=staging just test-webci-suite webapp_smoke   (valider un déploiement)   |   just test-webci-suite webapp_all   (tester un déploiement)
# Lancer les tests E2E webapp (CI) avec une suite nommée (webapp_*, liste plate de specs : un worker par spec)
test-webci-suite suite: _require-dotenv
    npm run test:webapp -- --suite {{suite}}

# ATTENTION : ne pas ouvrir le panneau DevTools (F12 / Cmd+Opt+I) sur l'onglet de l'app pendant
# le run — si un breakpoint est actif ou "Pause on exceptions" activé, le débogueur JS suspend
# réellement l'exécution de la page, ce qui bloque toute commande WebDriver (échoue au bout de
# 20s avec un message explicite plutôt qu'un hang silencieux, cf. ENSURE_APP_WINDOW_TIMEOUT_MS
# dans src/platform/browser.adapter.ts).
# Les globs sont optionnels (aucun = tous les tests) ; plusieurs globs possibles.
# Lancer les tests E2E webapp avec un Chrome dédié visible (headed), lancé par WDIO/Chromedriver
test-webapp *globs="": _require-dotenv
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🌐 Tests E2E webapp (Chrome visible)…"
    if [ -n "{{globs}}" ]; then
        SPEC_ARGS=""
        for glob in {{globs}}; do
            SPEC_ARGS="$SPEC_ARGS --spec $glob"
        done
        WEBAPP_HEADLESS=false npm run test:webapp -- $SPEC_ARGS
    else
        WEBAPP_HEADLESS=false npm run test:webapp
    fi

# Exemple : just test-webvideo src/tests/webapp/nonreg/consentement-demarches.usage.test.ts
# Lancer des tests webapp (headless) avec la config DevTools « vidéo » (wdio.webapp.with_video.conf.ts) : une vidéo .webm par test, réussi ou non,
# plus la trace rejouable avec `just failures-ui <dossier>`. Les fichiers sont dans test-results/traces/<horodatage>_webapp_<spec>/test-results/ (le chemin est affiché à la fin).
# Les globs sont obligatoires (la vidéo ralentit le run : on ne filme pas toute la suite).
[doc("Lancer des tests webapp avec la config DevTools vidéo · GLOBS")]
test-webvideo *globs: _require-dotenv
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🎬 Tests E2E webapp (headless, vidéo DevTools)…"
    SPEC_ARGS=""
    for glob in {{globs}}; do
        SPEC_ARGS="$SPEC_ARGS --spec $glob"
    done
    WEBAPP_HEADLESS=true npx wdio run wdio.webapp.with_video.conf.ts $SPEC_ARGS || status=$?
    echo "📼 Vidéos :"; find test-results/traces -name 'video-*.webm' -newermt '-1 hour' 2>/dev/null | sort | tail -5
    exit "${status:-0}"

# Exemple : just test-webapp-suite webapp_usage
# Lancer les tests E2E webapp (Chrome visible) avec une suite nommée (webapp_*, liste plate de specs : un worker par spec)
test-webapp-suite suite: _require-dotenv
    WEBAPP_HEADLESS=false npm run test:webapp -- --suite {{suite}}

# ─── Exploration et débogage (wdio session, WebdriverIO 10) ─────────────────
# Une session `wdio session` survit à la commande qui l'a ouverte (arrêt après 30 min d'inactivité) : on enchaîne
# de petites commandes. Cycle : explore → snapshot → actions → explore-export → test. Voir
# `.claude/skills/wdio-session/SKILL.md` et `docs/process/migration-wdio-10.md` §4.

# Usage : just explore-webapp   |   just explore-webapp "/#/agenda"
# Ouvre une session d'exploration sur la webapp (Chrome headless) et navigue vers une route (hash de la SPA, entre guillemets).
explore-webapp route="/": (_explore "webapp" route)

# Usage : just explore-android
# Ouvre une session d'exploration sur l'app Android (émulateur déjà démarré : just start-android), sans réinitialiser l'app.
explore-android: (_explore "android" "/")

# Usage : just explore-ios   |   just explore-ios --device "iPhone 17 Pro"
[doc("Session d'exploration iOS · [--device NOM]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
explore-ios device="": (_explore "ios" "/" device)

# Ouvre une session d'exploration sur une cible : webapp (Chrome), android ou ios.
# - webapp : pose le cookie `access_key` comme wdio.webapp.conf.ts (valeur de WEB_APP_ACCESS_KEYS, jamais
#   affichée) puis ouvre la route demandée de la SPA de l'environnement AMI_ENV.
# - android / ios : l'appareil doit déjà tourner (`just start-android` / `just start-ios`) ; l'app est ouverte
#   sans réinitialisation (--no-reset) : la connexion en cours est conservée. L'app apparaît d'abord sur
#   le sélecteur d'environnement (écran natif, sans WebView) ; la SPA est ensuite dans une WebView
#   (`just s <cible> contexts`, puis `exec`). En Android hybride, `snapshot` lit l'arbre natif.
# La SPA route par hash : la route d'une page est `/#/agenda` (à entourer de guillemets).
# (Recette privée : on lance explore-webapp, explore-android ou explore-ios.)
_explore target route device="": _require-dotenv
    #!/usr/bin/env bash
    set -euo pipefail
    S="npx wdio session -s {{ target }}"
    mask() { awk -v k="${WEB_APP_ACCESS_KEYS:-}" '{ while (length(k) > 0 && (i = index($0, k)) > 0) $0 = substr($0, 1, i-1) "***" substr($0, i + length(k)); print }'; }
    case "{{ target }}" in
      webapp)
        env="${AMI_ENV:-}"
        if [[ "$env" =~ [Pp][Rr][Ee][Pp][Rr][Oo][Dd] ]]; then origin="https://preprod.ami.beta.numerique.gouv.fr"; elif [[ "$env" =~ ([0-9]+) ]]; then origin="https://ami-back-staging-pr${BASH_REMATCH[1]}.osc-fr1.scalingo.io"; else origin="https://ami-back-staging.osc-fr1.scalingo.io"; fi
        [ -n "${WEB_APP_ACCESS_KEYS:-}" ] || { echo "❌ WEB_APP_ACCESS_KEYS absent de .env.local (cf. gabarit .env)"; exit 3; }
        $S open chrome "$origin/favicon.ico" --replace --no-snapshot --launch-timeout 240000 2>&1 | mask
        $S exec -e 'await browser.setCookies({name: "access_key", value: process.env.WEB_APP_ACCESS_KEYS, expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 3600})' 2>&1 | mask
        $S navigate "$origin{{ route }}" 2>&1 | mask
        ;;
      android)
        udid="$("{{ android_sdk }}/platform-tools/adb" devices | awk '/\tdevice$/{print $1; exit}')"
        [ -n "$udid" ] || { echo "❌ aucun appareil Android : lance « just start-android »"; exit 3; }
        $S open android --app "$(cd .. && pwd)/ami-app-android/app/build/outputs/apk/{{ android_flavor }}/debug/app-{{ android_flavor }}-debug.apk" --package {{ app_id }} --udid "$udid" --no-reset --replace --launch-timeout 240000 < /dev/null 2>&1
        ;;
      ios)
        $S open ios --app "$(cd .. && pwd)/build/Build/Products/Debug-iphonesimulator/{{ if preprod == "1" { "AMI-Preproduction" } else { "AMI-Production" } }}.app" --bundle-id {{ ios_bundle }} --udid "$(just --quiet _ios-udid "$(just --quiet _ios-device "{{ device }}")")" --no-reset --replace --launch-timeout 300000 < /dev/null 2>&1
        ;;
      *) echo "cible inconnue « {{ target }} » (webapp | android | ios)"; exit 2 ;;
    esac
    echo
    echo "── Et maintenant (session « {{ target }} ») ──────────────────────────────"
    echo "  just s {{ target }} snapshot -i          éléments interactifs, avec leurs refs (e1, e2…)"
    echo "  just s {{ target }} click e3             agir sur une ref ; le diff de la page s'affiche"
    echo "  just s {{ target }} find \"texte\"         retrouver un élément par son texte"
    echo "  just s {{ target }} logs --errors        erreurs console causées par la dernière action"
    echo "  just explore-export <nom> {{ target }}   transformer les étapes en test (exports/<nom>.e2e.ts)"
    echo "  just explore-close {{ target }}          fermer la session"

# Exemples : just s webapp click e3   |   just s webapp fill e4 "Passeport biométrique"   |   just s debug-0-0 snapshot -i
# Lance une action `wdio session` sur la session d'une cible, ou sur un test en pause (debug-0-0).
[positional-arguments]
s target *args:
    #!/usr/bin/env bash
    set -euo pipefail
    t="$1"; shift
    npx wdio session -s "$t" "$@"

# Liste les sessions ouvertes (dont un test en pause : debug-0-0).
sessions:
    npx wdio session list

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

# Sert surtout sur mobile : en Android hybride, `snapshot` lit l'arbre natif et plante après `contexts switch`
# (constaté le 2026-10-08, WDIO 10.0.1), alors que `exec` lit bien le DOM. Bascule seule sur la WebView, puis
# revient en natif. Sans WebView (sélecteur d'environnement, écran natif), utiliser `just s <cible> snapshot -i`.
# Liste les éléments interactifs du DOM de la WebView d'une session ouverte avec `just explore-<cible>`.
webview target="webapp":
    #!/usr/bin/env bash
    set -euo pipefail
    npx wdio session -s {{ target }} exec <<'JS'
    (async () => {
      if (browser.isMobile) {
        const web = (await browser.getContexts()).map(c => typeof c === 'string' ? c : c.id).find(c => c.startsWith('WEBVIEW'))
        if (!web) { console.log('Aucune WebView : écran natif (just s <cible> snapshot -i).'); return }
        await browser.switchContext(web)
      }
      const rows = await browser.execute(() => {
        const sel = 'button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], h1, h2, h3'
        const seen = new Set()
        return Array.from(document.querySelectorAll(sel)).filter(el => el.getClientRects().length > 0).map(el => {
          const labelled = el.getAttribute('aria-labelledby')
          const name = el.getAttribute('aria-label') || (labelled ? labelled.split(' ').map(i => document.getElementById(i)?.textContent || '').join(' ') : '') || (el.textContent || '').trim() || el.value || el.title || ''
          const role = el.getAttribute('role') || el.tagName.toLowerCase()
          return role + '  «' + name.replace(/\s+/g, ' ').trim().slice(0, 70) + '»' + (el.id ? '  #' + el.id : '')
        }).filter(r => !seen.has(r) && seen.add(r))
      })
      console.log(rows.length + ' éléments interactifs ou titres dans la WebView :')
      for (const r of rows) console.log('  ' + r)
      if (browser.isMobile) await browser.switchContext('NATIVE_APP')
    })()
    JS

# Lance un test et le MET EN PAUSE à son premier échec de test (session « debug-0-0 »). Un échec de hook
# (`before all`) ne déclenche pas la pause. Depuis un autre terminal : just s debug-0-0 snapshot -i,
# just s debug-0-0 screenshot, just s debug-0-0 resume.
# (Recette privée : on lance debug-webapp, debug-android ou debug-ios.)
_debug target spec device="": _require-dotenv
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ target }}" in
      android) [ -z "{{ device }}" ] || export ANDROID_DEVICE_NAME="{{ device }}"; export ANDROID_UDID="$(just --quiet _android-udid "{{ device }}")" ;;
      ios) export IOS_DEVICE_NAME="$(just --quiet _ios-device "{{ device }}")"; export IOS_UDID="$(just --quiet _ios-udid "$IOS_DEVICE_NAME")" ;;
    esac
    npx wdio run wdio.{{ target }}.conf.ts --spec {{ spec }} --debug=agent

# Usage : just debug-webapp src/tests/webapp/agenda.parcours.test.ts
# Lance un test webapp et le met en pause à son premier échec (session debug-0-0).
debug-webapp spec: (_debug "webapp" spec)

# Usage : just debug-android src/tests/mobile/profil-et-suppression-a-la-deconnexion.usage.test.ts   |   just debug-android src/tests/mobile/profil-et-suppression-a-la-deconnexion.usage.test.ts --device pixel_2_api30
[doc("Test Android en pause au 1er échec · FICHIER [--device AVD]")]
[arg("device", long="device", help="AVD visé. Défaut : l'appareil Android connecté (adb), sinon ANDROID_DEVICE_NAME_DEFAULT (.env.local)")]
debug-android spec device="": (_debug "android" spec device)

# Usage : just debug-ios src/tests/mobile/profil-et-suppression-a-la-deconnexion.usage.test.ts   |   just debug-ios src/tests/mobile/profil-et-suppression-a-la-deconnexion.usage.test.ts --device "iPhone 17 Pro"
[doc("Test iOS en pause au 1er échec · FICHIER [--device NOM]")]
[arg("device", long="device", help="Simulateur visé (nom exact). Défaut : le simulateur démarré, sinon IOS_DEVICE_NAME_DEFAULT (.env.local)")]
debug-ios spec device="": (_debug "ios" spec device)

# Les croix « cloud » (BrowserStack…) et « desktop » (windows, mac2) ne nous concernent pas.
# Exemples : just doctor   |   just doctor android
# Diagnostic de l'environnement : Node, navigateurs, Appium et drivers, SDK Android, simulateurs.
doctor target="":
    #!/usr/bin/env bash
    npx wdio session doctor {{ target }} || echo "→ Les ✖ cloud (BrowserStack…) et desktop (mac2, windows) sont sans objet ici ; seuls node, appium, android-sdk et simctl comptent."

# Pour chaque test : plateforme, appareil, étapes, erreur (message complet, 12 lignes au plus), URL (jetons masqués) et lien Sentry de la SPA (context.json de chaque dossier).
# Captures, arbre de l'écran et réseau : traces du service DevTools, une par test et par run, dans
# test-results/traces/<horodatage>_<plateforme>_<suite ou spec>/test-results/ (just failures-ui pour les ouvrir). Les dumps sont dans le
# sous-dossier failures/ du même run. Le résumé passants/cassés (JUnit XML, un fichier par run) est dans test-results/junit/.
# DOSSIER : un dossier de dumps, un dossier de run, ou tout dossier qui en contient (ex. l'artefact d'un run de CI téléchargé).
# Exemples : just failures-text   |   just failures-text test-results/traces/2026-10-12T14-06-09-523Z_webapp_aide-contact   |   just failures-text temp/test-results-pr1275
[doc("Lister les tests en échec du dernier run · [DOSSIER]")]
failures-text dir="":
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{ dir }}"
    if [ -z "$root" ]; then
        # Le dernier run qui a des dumps : les noms de run commencent par l'horodatage, donc le tri alphabétique est chronologique.
        latest="$(ls -d test-results/traces/*/failures 2>/dev/null | sort | tail -1 || true)"
        root="${latest:-test-results/failures}"
    fi
    [ -d "$root" ] || { echo "Aucun dump dans $root (aucun échec, ou aucun run)."; exit 0; }
    node -e '
      const fs = require("fs"), path = require("path"), root = process.argv[1]
      const found = []
      const walk = (dir) => {
        if (fs.existsSync(path.join(dir, "context.json"))) { found.push(dir); return }
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(path.join(dir, e.name))
      }
      walk(root)
      found.sort()
      if (found.length === 0) { console.log("Aucun dump dans " + root); process.exit(0) }
      for (const d of found) {
        const c = JSON.parse(fs.readFileSync(path.join(d, "context.json"), "utf8"))
        console.log("✖ " + c.test + "  [" + c.platform + (c.device && c.device.deviceName ? " · " + c.device.deviceName : "") + "]  " + c.failedAtUtc)
        if (c.error) {
          const lines = String(c.error.message).split("\n").filter(Boolean)
          console.log("    erreur : " + lines[0].slice(0, 200))
          for (const l of lines.slice(1, 12)) console.log("             " + l.slice(0, 200))
        }
        if (c.url) console.log("    url    : " + c.url)
        if (c.steps && c.steps.length) console.log("    étapes : " + c.steps.join(" › "))
        if (c.sentry) console.log("    sentry : " + (c.sentry.url || "trace inconnue") + " · dernier événement " + c.sentry.lastEventId + " · " + c.sentry.environment)
        console.log("    dossier: " + d)
      }
    ' "$root"

# Pendant visuel de `just failures-text` : ouvre dans le lecteur DevTools (captures, arbre de l'écran, réseau) la trace d'un test en échec.
# Les traces ne sont gardées que pour les tests en échec ou rejoués : toute trace d'un run est donc celle d'un échec.
# CIBLE : un dossier de run (test-results/traces/<horodatage>_…), l'artefact d'une CI téléchargé, le dossier d'un test ou d'une trace
# (celui qui contient trace.trace), ou un .zip. Sans CIBLE : le dernier run qui a des traces.
# Si la cible en contient plusieurs, la recette les liste ; FILTRE (sous-chaîne du chemin, donc du nom du test) en désigne une.
# Le lecteur (show-trace) ne lit que des .zip : un dossier de trace (traceFormat 'ndjson-directory') est zippé à la volée dans un
# dossier temporaire. Il s'ouvre dans le navigateur ; Ctrl+C l'arrête.
# Exemples : just failures-ui   |   just failures-ui "" agenda   |   just failures-ui test-results/traces/2026-10-12T14-06-09-523Z_webapp_aide-contact   |   just failures-ui temp/test-results-pr1275
[doc("Ouvrir dans DevTools la trace d'un test en échec · [CIBLE] [FILTRE]")]
failures-ui target="" filter="":
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{ target }}"
    if [ -z "$root" ]; then
        # Les noms de run commencent par l'horodatage : le tri alphabétique est chronologique.
        root="$(find test-results/traces -name trace.trace 2>/dev/null | sed 's#^\(test-results/traces/[^/]*\)/.*#\1#' | sort -u | tail -1 || true)"
        [ -n "$root" ] || { echo "Aucune trace dans test-results/traces/ (aucun échec, ou aucun run)."; exit 0; }
    fi
    if [ -f "$root" ]; then
        zip="$root"
    else
        [ -d "$root" ] || { echo "❌ « $root » introuvable." >&2; exit 1; }
        traces=()
        while IFS= read -r t; do
            traces+=("$(dirname "$t")")
        done < <(find "$root" -name trace.trace | grep -F -- "{{ filter }}" | sort)
        [ "${#traces[@]}" -gt 0 ] || { echo "Aucune trace dans $root{{ if filter == "" { "" } else { " pour « " + filter + " »" } }}."; exit 0; }
        if [ "${#traces[@]}" -gt 1 ]; then
            echo "${#traces[@]} traces dans $root — précisez-en une avec FILTRE (just failures-ui \"$root\" <texte>) :"
            for t in "${traces[@]}"; do echo "  - ${t#"$root"/}"; done
            exit 0
        fi
        echo "📄 Transcript : ${traces[0]}/transcript.md"
        zip="$(mktemp -d)/trace.zip"
        (cd "${traces[0]}" && zip -qr "$zip" .)
    fi
    echo "🔎 Ouverture de la trace dans le lecteur (Ctrl+C pour l'arrêter)…"
    npx show-trace "$zip"

# Supprime les données produites par les tests et l'exploration : `.wdio` (sessions `wdio session`, snapshots), `.wdio-logs` et le CONTENU de
# `test-results/` (traces, vidéos, dumps d'échec, JUnit). Les dossiers eux-mêmes sont conservés ; tout est régénéré au prochain run.
# Perdu définitivement : les traces/vidéos à consulter (`just failures-text`, `just trace`) et les sessions d'exploration ouvertes
# (`just sessions`). Refuse de tourner pendant un `wdio run` : supprimer `test-results/` en plein run le corromprait.
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

# AMI_ENV (.env.local) détermine l'environnement cible (« preprod » → préproduction, nombre → PR, sinon → staging).
# Exemples : just push-notification avec_nom_dusage   |   just push-notification avec_nom_dusage "Mon titre personnalisé"
# Envoyer une notification de test à un utilisateur (sans lancer les tests E2E).
push-notification login title="": _require-dotenv
    npx ts-node --project tsconfig.json src/scripts/push-notification.ts "{{login}}" "{{title}}"

# ─── Aide ───────────────────────────────────────────────────────────────────

# Détail des arguments d'une recette : `just --usage <recette>`.
# Lister les recettes (même chose que `just --list`, avec le rappel de `just --usage`)
help:
    @just --list --list-heading $'Recettes — détail des arguments d\'une recette : just --usage <recette>\n'

