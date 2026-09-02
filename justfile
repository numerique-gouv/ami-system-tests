# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

set dotenv-path := ".env.local"
# `just` interdit les settings booléens calculés (voir doc `set`), donc ce flag ne peut pas
# être conditionné sur CI/GITHUB_ACTIONS ici. Le caractère obligatoire de .env.local en dev
# local est réimplémenté par la recette de garde `_require-dotenv` ci-dessous.
set dotenv-required := false

# ─── Variables ──────────────────────────────────────────────────────────────

android_project := "../ami-app-android"
ios_project     := "../ami-app-ios"
app_id          := "fr.gouv.ami.staging"

android_apk := android_project / "app/build/outputs/apk/staging/debug/app-staging-debug.apk"
# Le projet iOS construit dans son propre dossier build/.
ios_derived := ios_project / "build"
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator/AMI-Production.app"

android_avd := "Pixel_modern"
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

# Installer les dépendances Node et les drivers Appium
setup:
    @echo "📥 Installation des dépendances…"
    npm install
    @echo "📥 Installation des drivers Appium…"
    npm run appium:install || true
    @echo "✅ Setup terminé. Lance 'just test-android' ou 'just test-ios'."

setup-claude:
    npx skills add klamping/webdriverio-skills

# Repartir d'un node_modules propre, strictement conforme au lockfile
clean-install:
    @echo "🧹 Suppression de node_modules…"
    rm -rf node_modules
    @echo "📥 Réinstallation stricte depuis package-lock.json…"
    npm ci
    @echo "📥 Installation des drivers Appium…"
    npm run appium:install || true
    @echo "✅ node_modules reconstruit."

# Télécharger et installer manuellement chromedriver dans le cache WDIO.
# Utile quand le téléchargement automatique WDIO échoue (proxy/réseau) avec une erreur du type
# "All providers failed for chromedriver ... the executable is missing".
# Sans argument : détecte la version depuis le Chrome installé localement (macOS).
# Usage : just fix-chromedriver                  → auto-détection
#         just fix-chromedriver 151.0.7922.174   → force une version précise
fix-chromedriver version="":
    #!/usr/bin/env bash
    set -euo pipefail
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        PLATFORM_TAG="mac_arm"; DOWNLOAD_PLATFORM="mac-arm64"
    else
        PLATFORM_TAG="mac_x64"; DOWNLOAD_PLATFORM="mac-x64"
    fi

    VERSION="{{version}}"
    if [ -z "$VERSION" ]; then
        CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if [ ! -x "$CHROME_BIN" ]; then
            echo "❌ Chrome introuvable à '$CHROME_BIN' — passe la version explicitement : just fix-chromedriver <version>" >&2
            exit 1
        fi
        CHROME_VERSION=$("$CHROME_BIN" --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
        echo "🔍 Chrome installé : $CHROME_VERSION"
        VERSION=$(curl -fsSL "https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json" \
            | node -e "
                const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
                const target = '$CHROME_VERSION';
                const hasDriver = v => v.downloads.chromedriver?.some(d => d.platform === '$DOWNLOAD_PLATFORM');
                const exact = data.versions.find(v => v.version === target && hasDriver(v));
                if (exact) { console.log(exact.version); process.exit(0); }
                const prefix = target.split('.').slice(0, 3).join('.') + '.';
                const candidates = data.versions.filter(v => v.version.startsWith(prefix) && hasDriver(v));
                if (!candidates.length) process.exit(1);
                console.log(candidates[candidates.length - 1].version);
            ")
        if [ -z "$VERSION" ]; then
            echo "❌ Aucun chromedriver publié pour Chrome $CHROME_VERSION." >&2
            exit 1
        fi
        echo "🎯 Chromedriver ciblé : $VERSION"
    fi

    CACHE_ROOT="${TMPDIR:-/tmp}"
    CACHE_DIR="${CACHE_ROOT%/}/chromedriver/${PLATFORM_TAG}-${VERSION}"
    TARGET="$CACHE_DIR/chromedriver-${DOWNLOAD_PLATFORM}/chromedriver"
    if [ -x "$TARGET" ]; then
        echo "✅ Déjà présent : $TARGET"
        exit 0
    fi
    mkdir -p "$CACHE_DIR"
    ZIP="$CACHE_DIR/chromedriver-${DOWNLOAD_PLATFORM}.zip"
    URL="https://storage.googleapis.com/chrome-for-testing-public/${VERSION}/${DOWNLOAD_PLATFORM}/chromedriver-${DOWNLOAD_PLATFORM}.zip"
    echo "📥 Téléchargement : $URL"
    curl -fSL -o "$ZIP" "$URL"
    unzip -o "$ZIP" -d "$CACHE_DIR"
    chmod +x "$TARGET"
    xattr -d com.apple.quarantine "$TARGET" 2>/dev/null || true
    echo "✅ Chromedriver installé : $TARGET"

# Afficher les dépendances dépassées (sans modifier package.json)
check-deps:
    npx npm-check-updates

# Mettre à jour package.json vers les dernières versions puis réinstaller
upgrade:
    npx npm-check-updates --upgrade
    @just setup

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
    fi
    open -a Simulator

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

# Lancer les tests E2E webapp (CI) avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-webci-suite <suite>   ex: just test-webci-suite all
test-webci-suite suite: _require-dotenv
    WDIO_SUITE={{suite}} npm run test:webapp

# Lancer les tests E2E webapp avec un Chrome dédié visible (headed), lancé par WDIO/Chromedriver
#
# ATTENTION : ne pas ouvrir le panneau DevTools (F12 / Cmd+Opt+I) sur l'onglet de l'app pendant
# le run — si un breakpoint est actif ou "Pause on exceptions" activé, le débogueur JS suspend
# réellement l'exécution de la page, ce qui bloque toute commande WebDriver (échoue au bout de
# 20s avec un message explicite plutôt qu'un hang silencieux, cf. ENSURE_APP_WINDOW_TIMEOUT_MS
# dans src/platform/browser.adapter.ts).
# Usage : just test-webapp [glob…]   — un ou plusieurs globs de fichiers (optionnels)
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

# Lancer les tests E2E webapp (Chrome visible) avec une suite nommée (session partagée — auth une seule fois)
# Usage : just test-webapp-suite <suite>   ex: just test-webapp-suite all
test-webapp-suite suite: _require-dotenv
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
report:
    npm run report

# Envoyer une notification de test à un utilisateur (sans lancer les tests E2E).
# AMI_ENV (.env.local) détermine l'environnement cible (nombre → PR, sinon → staging).
# Usage : just push-notification avec_nom_dusage
#         just push-notification avec_nom_dusage "Mon titre personnalisé"
push-notification login title="": _require-dotenv
    npx ts-node --project tsconfig.json src/scripts/push-notification.ts "{{login}}" "{{title}}"

# ─── Documentation ──────────────────────────────────────────────────────────

# Installer les dépendances du site de documentation
setup-docs:
    npm ci --prefix site

# Servir le site en local (pathPrefix = /, liens absolus)
serve-docs: setup-docs
    npm run start --prefix site

# Builder le site avec le pathPrefix de production
build-docs: setup-docs
    ELEVENTY_PATH_PREFIX=/ami-system-tests/ npm run build --prefix site

# Mettre à jour le template eleventy-dsfr depuis l'upstream
update-docs:
    git fetch docs-upstream
    git subtree pull --prefix=site docs-upstream main --squash

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

