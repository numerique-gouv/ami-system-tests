# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

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
app_id          := "fr.gouv.ami.staging"

android_apk := android_project / "app/build/outputs/apk/staging/debug/app-staging-debug.apk"
# Le projet iOS construit avec -derivedDataPath ../build depuis ami-app-ios/, donc à côté
# de ami-app-ios/ (sibling sous ami/), pas dans ami-app-ios/build/.
ios_derived := "../build"
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator/AMI-Production.app"

# env_var_or_default (pas juste "Pixel_modern" en dur) : sans ça, `start-android` ignore
# ANDROID_DEVICE_NAME et boote toujours Pixel_modern, même quand on demande explicitement un
# autre AVD (ex. ANDROID_DEVICE_NAME=pixel_2_api30 just test-android-suite short) — le device
# ciblé par les capabilities Appium (capabilities.ts) et l'AVD réellement démarré divergeaient.
android_avd := env_var_or_default("ANDROID_DEVICE_NAME", "Pixel_modern")
android_sdk := env_var_or_default("ANDROID_SDK_ROOT", env_var_or_default("ANDROID_HOME", ""))

# Nom du simulateur iOS tel qu'attendu par xcrun simctl (espaces, pas tirets)
# Doit correspondre à la -destination utilisée dans build-ios
ios_simulator := env_var_or_default("IOS_SIMULATOR", "iPhone 17 Pro")

# ─── Setup ──────────────────────────────────────────────────────────────────

# Vérifier que les outils nécessaires sont installés
check:
    @echo "🔍 Vérification des pré-requis…"
    @command -v adb       > /dev/null && echo "✅ adb"       || echo "❌ adb manquant (Android SDK)"
    @command -v xcodegen  > /dev/null && echo "✅ xcodegen"  || echo "❌ xcodegen manquant (brew install xcodegen)"
    @command -v node      > /dev/null && echo "✅ node"      || echo "❌ node manquant"
    @(command -v appium > /dev/null || [ -f node_modules/.bin/appium ]) && echo "✅ appium" || echo "❌ appium manquant (npm install)"
    @command -v just      > /dev/null && echo "✅ just"      || echo "❌ just manquant"

# Installer les drivers Appium sous le APPIUM_HOME du projet (cf. variable ci-dessus) — passer
# par cette recette (plutôt que `npm run appium:install` en direct) garantit que l'install et le
# `just test-android`/`test-ios` qui suivra utilisent le même APPIUM_HOME.
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

# Pré-installe Chrome for Testing + chromedriver (version de `.chrome-version`) dans `.cache/`.
# Contourne WDIO : son extraction (`extract-zip`) ne se termine pas sous Node 26 — le process quitte
# en plein dépaquetage (« unsettled top-level await », exit 13), laisse un dossier à moitié extrait
# (sans l'exécutable) et WDIO conclut « All providers failed ». `unzip` système n'a pas ce défaut.
# Idempotent : ne fait rien si les exécutables sont déjà là. macOS uniquement (sinon WDIO se charge de tout).
_ensure-chrome:
    #!/usr/bin/env bash
    set -euo pipefail
    [ "$(uname -s)" = "Darwin" ] || exit 0
    if [ "$(uname -m)" = "arm64" ]; then TAG="mac_arm"; PLATFORM="mac-arm64"; else TAG="mac_x64"; PLATFORM="mac-x64"; fi
    VERSION=$(tr -d '[:space:]' < .chrome-version)
    install() { # nom exécutable-relatif
        local name="$1" exe="$2" dir=".cache/$1/${TAG}-${VERSION}"
        if [ -x "$dir/$exe" ]; then return 0; fi
        echo "📥 $name $VERSION → $dir"
        rm -rf "$dir"; mkdir -p "$dir"
        local zip; zip=$(mktemp -t "$name").zip
        curl -fSL -o "$zip" "https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/${PLATFORM}/${name}-${PLATFORM}.zip"
        unzip -q "$zip" -d "$dir"
        rm -f "$zip"
        xattr -dr com.apple.quarantine "$dir" 2>/dev/null || true
        [ -x "$dir/$exe" ] || { echo "❌ $name : exécutable absent après extraction ($dir/$exe)" >&2; exit 1; }
    }
    install chrome "chrome-${PLATFORM}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    install chromedriver "chromedriver-${PLATFORM}/chromedriver"

# Version de Chrome for Testing utilisée par les tests webapp (fichier `.chrome-version`, lu par
# wdio.webapp.conf.ts). WDIO télécharge ce Chrome + le chromedriver apparié dans `.cache/` (une
# seule fois) — le Chrome installé sur la machine et ses mises à jour automatiques sont ignorés.
# Sans argument : affiche la version épinglée, les versions disponibles par canal, et signale
#                 celles plus récentes que l'épinglée.
# Avec une version : l'épingle (ex. `just update-chrome 156.0.8078.4`), vérifie qu'elle est publiée
#                 pour cette plateforme ; le téléchargement a lieu au prochain `just test-webapp*`.
update-chrome version="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "$(uname -m)" = "arm64" ]; then PLATFORM="mac-arm64"; else PLATFORM="mac-x64"; fi
    PINNED=$(tr -d '[:space:]' < .chrome-version)
    VERSION="{{version}}"

    if [ -n "$VERSION" ]; then
        curl -fsSL "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json" \
            | node -e "
                const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
                const v = data.versions.find(v => v.version === '$VERSION');
                const ok = k => v?.downloads[k]?.some(d => d.platform === '$PLATFORM');
                if (!ok('chrome') || !ok('chromedriver')) {
                    console.error('❌ $VERSION : Chrome + chromedriver non publiés pour $PLATFORM (cf. just update-chrome sans argument).');
                    process.exit(1);
                }
            "
        echo "$VERSION" > .chrome-version
        echo "✅ Chrome for Testing épinglé : $PINNED → $VERSION (téléchargé au prochain test webapp)"
        echo "   Pense à relancer la suite webapp, puis à commiter .chrome-version."
        exit 0
    fi

    echo "📌 Version épinglée : $PINNED"
    echo
    curl -fsSL "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json" \
        | node -e "
            const pinned = '$PINNED';
            const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
            const ok = (c, k) => c.downloads[k]?.some(d => d.platform === '$PLATFORM');
            const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number);
                for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
            console.log('Versions disponibles ($PLATFORM, chrome + chromedriver) :');
            for (const [name, c] of Object.entries(data.channels)) {
                if (!ok(c, 'chrome') || !ok(c, 'chromedriver')) continue;
                const d = cmp(c.version, pinned);
                const tag = d === 0 ? '(= épinglée)' : d > 0 ? '⬆ plus récente' : '(plus ancienne)';
                console.log('  ' + name.padEnd(7) + c.version.padEnd(18) + tag);
            }
            console.log();
            console.log('Pour changer : just update-chrome <version>   (Stable recommandée)');
        "

# Afficher les dépendances dépassées (sans modifier package.json)
check-deps:
    npx npm-check-updates

# Mettre à jour package.json vers les dernières versions puis réinstaller
# généralement, le cocktail de mise à jour crée une jeu de version incompatibles entree elles
# ce script est souvent a terminer manuellement
# npm doit être configuré avec cooldown de 14 jours
# cat $HOME/.npmrc
# min-release-age=14
# appium ne connait pas ce concept et on peut les mettre à jours en annulant le cooldown configuré:
# npm_config_min_release_age=0 npm run appium:update
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
        echo "   → Lance le build depuis le projet mobile : cd {{android_project}} && ./gradlew assembleStagingDebug"
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
        echo "   → Lance le build depuis le projet mobile : cd {{ios_project}} && just build (ou xcodebuild)"
        exit 1
    fi

# ─── Émulateurs / Simulateurs ───────────────────────────────────────────────

# Démarrer l'émulateur Android si aucun appareil n'est déjà connecté via adb.
# Si un émulateur est déjà actif (quelle que soit sa provenance), on le réutilise.
# Attend que UiAutomation soit disponible (sys.boot_completed + package manager prêt).
start-android:
    #!/usr/bin/env bash
    set -euo pipefail
    ADB="{{ android_sdk }}/platform-tools/adb"
    EMU="{{ android_sdk }}/emulator/emulator"
    # Vérifie si un appareil est déjà connecté et booté
    BOOTED=$("$ADB" devices | awk '/\tdevice$/{print $1}' | head -1)
    if [ -n "$BOOTED" ]; then
        echo "✅ Appareil déjà connecté : $BOOTED — réutilisé."
        exit 0
    fi
    echo "🤖 Démarrage de l'émulateur {{ android_avd }}…"
    "$EMU" -avd {{ android_avd }} -no-snapshot-save &
    "$ADB" wait-for-device
    until "$ADB" shell getprop sys.boot_completed 2>/dev/null | grep -q '^1$'; do sleep 2; done
    # Attendre que le package manager soit opérationnel (requis par UiAutomator2)
    until "$ADB" shell pm list packages > /dev/null 2>&1; do sleep 1; done
    # Déverrouiller l'écran — UiAutomation exige l'écran allumé et déverrouillé.
    # Le snapshot default_boot peut charger avec l'écran verrouillé.
    "$ADB" shell input keyevent 82   # KEYCODE_MENU : réveille l'écran
    "$ADB" shell input keyevent 4    # KEYCODE_BACK  : ferme tout dialog éventuel
    "$ADB" shell input keyevent 3    # KEYCODE_HOME : accueil launcher (pas d'app ouverte)
    sleep 2
    echo "✅ Émulateur prêt."

# Arrêter l'émulateur Android
stop-android:
    {{android_sdk}}/platform-tools/adb emu kill || true

# Démarrer le simulateur iOS et attendre qu'il soit prêt
start-ios:
    #!/usr/bin/env bash
    set -euo pipefail
    if xcrun simctl list devices booted | grep -q "{{ ios_simulator }}"; then
        echo "✅ Simulateur '{{ ios_simulator }}' déjà démarré."
    else
        echo "📱 Démarrage du simulateur '{{ ios_simulator }}'…"
        xcrun simctl boot "{{ ios_simulator }}"
        until xcrun simctl list devices booted | grep -q "{{ ios_simulator }}"; do sleep 1; done
        echo "✅ Simulateur prêt."
        # L'app graphique n'est ouverte qu'au démarrage du simulateur : `open` à chaque appel ajoutait une
        # fenêtre Device Hub par lancement de test.
        open -b com.apple.dt.Devices 2>/dev/null || open -a Simulator 2>/dev/null || echo "⚠️  App graphique Simulator.app/DeviceHub.app introuvable — simulateur utilisable en headless via simctl, tests non bloqués."
    fi

# Arrêter le simulateur iOS (tous les simulateurs démarrés)
stop-ios:
    @echo "🛑 Arrêt du simulateur '{{ ios_simulator }}'…"
    xcrun simctl shutdown "{{ ios_simulator }}" || true
    @echo "✅ Simulateur arrêté."

# Arrêter tous les simulateurs
stop: stop-android stop-ios

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
#   just test-android-suite all              → tous les tests en session partagée (auth une fois)
#   just test-android-suite CI              → smoke suite (auth + tests critiques)

# Garde-fou : hors CI, .env.local est obligatoire (AMI_ENV, NOTIF_*).
# En CI ces variables sont injectées par le workflow via `env:` — pas de fichier requis.
_require-dotenv:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${CI:-}${GITHUB_ACTIONS:-}" ] && [ ! -f .env.local ]; then
        echo "❌ .env.local manquant — copier .env puis renseigner AMI_ENV et NOTIF_*." >&2
        exit 1
    fi

# Lancer les tests E2E Android — démarre l'émulateur, lance les tests sur les fichiers fournis
# Usage : just test-android [glob…]   — un ou plusieurs globs de fichiers (optionnels)
test-android *globs="": _require-dotenv start-android
    #!/usr/bin/env bash
    set -euo pipefail
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

# Lancer les tests E2E iOS — démarre le simulateur, lance les tests sur les fichiers fournis
# Usage : just test-ios [glob…]       — un ou plusieurs globs de fichiers (optionnels)
test-ios *globs="": _require-dotenv start-ios
    #!/usr/bin/env bash
    set -euo pipefail
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

# Lancer les tests E2E Android avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-android-suite <suite>   ex: just test-android-suite all
test-android-suite suite: _require-dotenv start-android
    WDIO_SUITE={{suite}} npm run test:android

# Lancer les tests E2E iOS avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-ios-suite <suite>   ex: just test-ios-suite CI
test-ios-suite suite: _require-dotenv start-ios
    WDIO_SUITE={{suite}} npm run test:ios

# Lancer les tests E2E webapp (CI) — Chrome headless, pas d'émulateur/simulateur à démarrer
# Usage : just test-webci [glob…]   — un ou plusieurs globs de fichiers (optionnels)
test-webci *globs="": _require-dotenv _ensure-chrome
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

# Lancer les tests E2E webapp (CI) avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-webci-suite <suite>   ex: just test-webci-suite all
test-webci-suite suite: _require-dotenv _ensure-chrome
    WDIO_SUITE={{suite}} npm run test:webapp

# Lancer les tests E2E webapp avec un Chrome dédié visible (headed), lancé par WDIO/Chromedriver
#
# ATTENTION : ne pas ouvrir le panneau DevTools (F12 / Cmd+Opt+I) sur l'onglet de l'app pendant
# le run — si un breakpoint est actif ou "Pause on exceptions" activé, le débogueur JS suspend
# réellement l'exécution de la page, ce qui bloque toute commande WebDriver (échoue au bout de
# 20s avec un message explicite plutôt qu'un hang silencieux, cf. ENSURE_APP_WINDOW_TIMEOUT_MS
# dans src/platform/browser.adapter.ts).
# Usage : just test-webapp [glob…]   — un ou plusieurs globs de fichiers (optionnels)
test-webapp *globs="": _require-dotenv _ensure-chrome
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

# Lancer les tests E2E webapp (Chrome visible) avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-webapp-suite <suite>   ex: just test-webapp-suite all
test-webapp-suite suite: _require-dotenv _ensure-chrome
    WEBAPP_HEADLESS=false WDIO_SUITE={{suite}} npm run test:webapp

# ─── Inspection / Reporting ─────────────────────────────────────────────────

# Lister les éléments interactifs de la WebView courante (sans réinitialiser l'app).
# Détecte automatiquement la plateforme : exactement un appareil Android OU un simulateur iOS doit être connecté.
# Usage : just inspect              → inspecte l'écran courant
#         just inspect /notifications → navigue vers /#/notifications puis inspecte
inspect:
    #!/usr/bin/env bash
    set -euo pipefail
    ADB="{{ android_sdk }}/platform-tools/adb"
    export ANDROID_SDK_ROOT="{{ android_sdk }}"
    export ANDROID_HOME="{{ android_sdk }}"

    ANDROID_DEVICE=$("$ADB" devices 2>/dev/null | awk '/\tdevice$/{print $1}' | head -1 || true)
    IOS_DEVICE=$(xcrun simctl list devices booted 2>/dev/null \
        | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1 || true)

    if [ -n "$ANDROID_DEVICE" ] && [ -n "$IOS_DEVICE" ]; then
        echo "❌ Android ($ANDROID_DEVICE) ET iOS ($IOS_DEVICE) détectés. Arrête-en un avec 'just stop-android' ou 'just stop-ios'."
        exit 1
    fi
    if [ -z "$ANDROID_DEVICE" ] && [ -z "$IOS_DEVICE" ]; then
        echo "❌ Aucun appareil détecté. Lance 'just start-android' ou 'just start-ios'."
        exit 1
    fi

    if [ -n "$ANDROID_DEVICE" ]; then
        PLATFORM=android
        echo "🤖 Appareil Android détecté : $ANDROID_DEVICE"
        # Android 16 (API 36) : un IAccessibilityServiceClient résiduel (Maestro ou run précédent)
        # bloque la connexion UiAutomation avec "already registered" / "id=-1".
        # Force-stop tous les packages susceptibles d'avoir laissé un client enregistré.
        "$ADB" shell am force-stop io.appium.uiautomator2.server.test 2>/dev/null || true
        "$ADB" shell am force-stop io.appium.uiautomator2.server 2>/dev/null || true
        "$ADB" shell am force-stop dev.mobile.maestro 2>/dev/null || true
        "$ADB" shell am force-stop dev.mobile.maestro.test 2>/dev/null || true
        # Réveiller l'écran (KEYCODE_WAKEUP=224) sans interagir avec l'app au premier plan.
        # Ne pas utiliser keyevent 4 (BACK) : il naviguerait dans l'app et ferait perdre la page en cours.
        "$ADB" shell input keyevent 224
        sleep 1
        # --allow-insecure active le téléchargement automatique de Chromedriver (requis WebView Android)
        APPIUM_EXTRA_ARGS="--allow-insecure uiautomator2:chromedriver_autodownload"
    else
        PLATFORM=ios
        echo "🍎 Simulateur iOS détecté : $IOS_DEVICE"
        APPIUM_EXTRA_ARGS=""
    fi

    echo "🔍 Démarrage Appium sur le port 4723…"
    # shellcheck disable=SC2086
    npm run appium:start -- --port 4723 $APPIUM_EXTRA_ARGS </dev/null &
    APPIUM_PID=$!
    trap "kill $APPIUM_PID 2>/dev/null || true" INT TERM EXIT
    sleep 5
    echo "🔍 Inspection de la WebView en cours ($PLATFORM)…"
    npx ts-node --project tsconfig.json src/scripts/inspect-webview.ts "$PLATFORM"
    kill $APPIUM_PID 2>/dev/null || true

# Générer et ouvrir le rapport Allure du dernier run.
# Si `folder` est un fichier, il doit s'agir d'une archive .zip (ex. artifact CI téléchargé
# dans temp/) : elle est décompressée dans un sous-dossier dédié avant l'ouverture du rapport.
# Usage : just open-report                                    → allure-report/
#         just open-report temp/allure-report-pr1275-run6.zip → décompresse puis ouvre
open-report folder="allure-report":
    #!/usr/bin/env bash
    set -euo pipefail
    TARGET="{{ folder }}"
    if [ -f "$TARGET" ]; then
        case "$TARGET" in
            *.zip) ;;
            *)
                echo "❌ Fichier non supporté (attendu : une archive .zip) : $TARGET" >&2
                exit 1
                ;;
        esac
        DEST="$(dirname "$TARGET")/$(basename "$TARGET" .zip)"
        echo "📦 Décompression de $TARGET dans ${DEST}."
        mkdir -p "$DEST"
        unzip -q "$TARGET" -d "$DEST"
        TARGET="$DEST"
    fi
    npm run open-report "$TARGET"

# Générer le rapport Allure sans l'ouvrir (CI — `allure open` bloquerait en démarrant un serveur)
generate-report:
    rm -rf allure-report && npx allure generate allure-results

# Générer puis ouvrir le rapport Allure du dernier run (usage local uniquement).
report: generate-report
    npm run open-report

# Envoyer une notification de test à un utilisateur (sans lancer les tests E2E).
# AMI_ENV (.env.local) détermine l'environnement cible (nombre → PR, sinon → staging).
# Usage : just push-notification avec_nom_dusage
#         just push-notification avec_nom_dusage "Mon titre personnalisé"
push-notification login title="": _require-dotenv
    npx ts-node --project tsconfig.json src/scripts/push-notification.ts "{{login}}" "{{title}}"

# ─── Présentation ───────────────────────────────────────────────────────────

# Compiler une présentation en PDF (nécessite typst : brew install typst)
# Usage : just build-pdf                  → slides.pdf
#         just build-pdf slides-equipe    → slides-equipe.pdf
build-pdf name="slides":
    @mkdir -p presentation/build
    typst compile presentation/{{name}}.typ presentation/build/{{name}}.pdf
    @echo "✅ PDF généré : presentation/build/{{name}}.pdf"

# Générer le PPTX depuis le PDF (1 slide = 1 PNG embarqué, 16:9)
# Nécessite : pdftoppm (brew install poppler) + python3-pptx (pip install python-pptx)
build-pptx name="slides": (build-pdf name)
    @mkdir -p presentation/build/png-{{name}}
    pdftoppm -png -r 200 presentation/build/{{name}}.pdf presentation/build/png-{{name}}/slide
    python3 presentation/make-pptx.py \
        presentation/build/png-{{name}} \
        presentation/build/{{name}}.pptx
    @echo "✅ PPTX généré : presentation/build/{{name}}.pptx"

# ─── Aide ───────────────────────────────────────────────────────────────────

# Afficher l'aide
help:
    @just --list

