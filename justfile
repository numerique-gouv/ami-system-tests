# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

set dotenv-path := ".env.local"
set dotenv-required := true

# ─── Variables ──────────────────────────────────────────────────────────────

android_project := "../ami-app-android"
ios_project     := "../ami-app-ios"
app_id          := "fr.gouv.ami.staging"

android_apk := android_project / "app/build/outputs/apk/staging/debug/app-staging-debug.apk"
# derivedData absolu (chemin justfile) car xcodebuild est invoqué après un `cd {{ios_project}}`.
# Volontairement hors du dossier ios_project : swiftlint ne scanne pas SourcePackages.
ios_derived := justfile_directory() / "build/ios"
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator/AMI-Staging.app"

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
    @command -v appium    > /dev/null && echo "✅ appium"    || echo "❌ appium manquant (npm i -g appium)"
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

# Afficher les dépendances dépassées (sans modifier package.json)
check-deps:
    npx npm-check-updates

# Mettre à jour package.json vers les dernières versions puis réinstaller
upgrade-deps:
    npx npm-check-updates --upgrade
    @just setup

# ─── Build ──────────────────────────────────────────────────────────────────

# Builder l'APK Android (flavor staging, debug)
# JDK 21 requis : Kotlin/Gradle ne supporte pas JDK 22+
build-android:
    @echo "📦 Build Android (staging/debug)…"
    cd {{android_project}} && JAVA_HOME=$(/usr/libexec/java_home -v 21 -a arm64) ./gradlew assembleStagingDebug
    @echo "✅ APK généré : {{android_apk}}"

# Builder l'app iOS pour simulateur (scheme AMI-Staging)
build-ios:
    @echo "🔨 Génération du projet Xcode via XcodeGen…"
    cd {{ios_project}} && xcodegen generate --spec ami-project.yml
    @echo "📦 Build iOS (AMI-Staging / simulateur)…"
    cd {{ios_project}} && xcodebuild \
        -scheme AMI-Staging \
        -configuration Debug \
        -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
        -derivedDataPath {{ ios_derived }} \
        -quiet \
        build
    @echo "✅ App générée : {{ios_app}}"

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
#   just test-android                → tous les tests
#   just test-android Notifications  → filtre par describe/it (grep Mocha, regex JS)

# Lancer les tests E2E Android — démarre l'émulateur, build, lance les tests
# Usage : just test-android [tag]    — tag filtre par describe/it Mocha (optionnel)
test-android tag="": start-android
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🤖 Tests E2E Android…"
    if [ -n "{{tag}}" ]; then
        npm run test:android -- --mochaOpts.grep "{{tag}}"
    else
        npm run test:android
    fi

# Lancer les tests E2E iOS — démarre le simulateur, build, reset FC, lance les tests
# Usage : just test-ios [tag]        — tag filtre par describe/it Mocha (optionnel)
test-ios tag="": start-ios
    #!/usr/bin/env bash
    set -euo pipefail
    echo "🍎 Tests E2E iOS…"
    just _reset-ios-fc-session
    if [ -n "{{tag}}" ]; then
        npm run test:ios -- --mochaOpts.grep "{{tag}}"
    else
        npm run test:ios
    fi

# ─── Inspection / Reporting ─────────────────────────────────────────────────

# Lister les éléments interactifs de la WebView courante (sans réinitialiser l'app).
# Détecte automatiquement la plateforme : exactement un appareil Android OU un simulateur iOS doit être connecté.
# Usage : just inspect              → inspecte l'écran courant
#         just inspect /notifications → navigue vers /#/notifications puis inspecte
inspect hash="":
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
        # Réveiller l'écran et s'assurer qu'il est déverrouillé
        "$ADB" shell input keyevent 82
        "$ADB" shell input keyevent 4
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
    npm run appium:start -- --port 4723 $APPIUM_EXTRA_ARGS &
    APPIUM_PID=$!
    trap "kill $APPIUM_PID 2>/dev/null; exit" INT TERM EXIT
    sleep 5
    echo "🔍 Inspection de la WebView en cours ($PLATFORM)…"
    npx ts-node --project tsconfig.json src/scripts/inspect-webview.ts "$PLATFORM" "{{hash}}"
    kill $APPIUM_PID 2>/dev/null || true

# Générer et ouvrir le rapport Allure du dernier run
open-report:
    npm run report

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

# ─── Privé ──────────────────────────────────────────────────────────────────

# Réinitialise complètement le conteneur de données de l'app AMI staging.
# Un effacement partiel (WebKit/cookies seuls) laisse l'app dans un état incohérent
# où la WKWebView se reconnecte sans afficher la mire FC. On vide tout le conteneur data.
[private]
_reset-ios-fc-session:
    #!/usr/bin/env bash
    set -euo pipefail
    BOOTED_UDID=$(xcrun simctl list devices booted \
        | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' \
        | head -1)
    if [ -z "$BOOTED_UDID" ]; then
        echo "⚠️  Aucun simulateur iOS démarré — _reset-ios-fc-session ignoré."
        exit 0
    fi
    # Réinitialise la permission notifications
    xcrun simctl privacy "$BOOTED_UDID" reset notifications {{ app_id }} 2>/dev/null || true
    # Efface les cookies SFSafariViewController (session OIDC FC partagée avec Safari)
    xcrun simctl spawn "$BOOTED_UDID" defaults delete com.apple.SafariViewService 2>/dev/null || true
    xcrun simctl spawn "$BOOTED_UDID" rm -rf /Library/Caches/com.apple.SafariViewService 2>/dev/null || true
    xcrun simctl spawn "$BOOTED_UDID" rm -f /var/mobile/Library/Cookies/com.apple.SafariViewService.binarycookies 2>/dev/null || true
    # Vide l'intégralité du conteneur data de l'app (équivalent "effacer les données" dans Réglages)
    APP_CONTAINER=$(xcrun simctl get_app_container "$BOOTED_UDID" {{ app_id }} data 2>/dev/null || true)
    if [ -n "$APP_CONTAINER" ]; then
        rm -rf "${APP_CONTAINER:?}/"* 2>/dev/null || true
    fi
    echo "✅ Conteneur data AMI staging vidé."
