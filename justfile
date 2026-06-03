# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

set dotenv-load := true

root := source_directory()

android_project := root / "../ami-app-android"
ios_project     := root / "../ami-app-ios"

android_apk := android_project / "app/build/outputs/apk/staging/debug/app-staging-debug.apk"
# derivedData hors du dossier ios_project : swiftlint ne scanne pas SourcePackages
ios_derived := root / "build/ios"
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator/AMI-Production.app"

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

# Builder les deux plateformes
build: build-android build-ios

# ─── Émulateurs / Simulateurs ───────────────────────────────────────────────

android_avd         := "Pixel_modern"
android_sdk         := env_var_or_default("ANDROID_SDK_ROOT", env_var_or_default("ANDROID_HOME", ""))

# Démarrer l'émulateur Android si aucun appareil n'est déjà connecté via adb.
# Si un émulateur est déjà actif (quelle que soit sa provenance), on le réutilise.
# Attend que UiAutomation soit disponible (sys.boot_completed + package manager prêt).
android-start:
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
android-stop:
    {{android_sdk}}/platform-tools/adb emu kill || true

# Nom du simulateur iOS tel qu'attendu par xcrun simctl (espaces, pas tirets)
# Doit correspondre à la -destination utilisée dans build-ios
ios_simulator := env_var_or_default("IOS_SIMULATOR", "iPhone 17 Pro")

# Démarrer le simulateur iOS et attendre qu'il soit prêt
ios-start:
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
ios-stop:
    @echo "🛑 Arrêt du simulateur '{{ ios_simulator }}'…"
    xcrun simctl shutdown "{{ ios_simulator }}" || true
    @echo "✅ Simulateur arrêté."

# Arrêter tous les simulateurs
stop: android-stop ios-stop

# ─── Présentation ────────────────────────────────────────────────────────────

# Compiler une présentation en PDF (nécessite typst : brew install typst)
# Usage : just pdf                  → slides.pdf
#         just pdf slides-equipe    → slides-equipe.pdf
pdf name="slides":
    @mkdir -p presentation/build
    typst compile presentation/{{name}}.typ presentation/build/{{name}}.pdf
    @echo "✅ PDF généré : presentation/build/{{name}}.pdf"

# Générer le PPTX depuis le PDF (1 slide = 1 PNG embarqué, 16:9)
# Nécessite : pdftoppm (brew install poppler) + python3-pptx (pip install python-pptx)
pptx name="slides": (pdf name)
    @mkdir -p presentation/build/png-{{name}}
    pdftoppm -png -r 200 presentation/build/{{name}}.pdf presentation/build/png-{{name}}/slide
    python3 presentation/make-pptx.py \
        presentation/build/png-{{name}} \
        presentation/build/{{name}}.pptx
    @echo "✅ PPTX généré : presentation/build/{{name}}.pptx"

# Générer le PPTX équipe avec la vidéo démo embarquée sur la slide 4
# Nécessite en plus : ffmpeg (brew install ffmpeg)
pptx-equipe: (pdf "slides-equipe")
    @mkdir -p presentation/build/png-slides-equipe
    pdftoppm -png -r 200 presentation/build/slides-equipe.pdf presentation/build/png-slides-equipe/slide
    python3 presentation/make-pptx.py \
        --video-on-slide 4 "presentation/assets/démo 2026 06 04 test E2E avec Webdriver.mp4" \
        presentation/build/png-slides-equipe \
        presentation/build/slides-equipe.pptx
    @echo "✅ PPTX équipe généré : presentation/build/slides-equipe.pptx"

# ─── Setup ──────────────────────────────────────────────────────────────────

# Vérifier que les outils nécessaires sont installés
check:
    @echo "🔍 Vérification des pré-requis…"
    @command -v adb       > /dev/null && echo "✅ adb"       || echo "❌ adb manquant (Android SDK)"
    @command -v xcodegen  > /dev/null && echo "✅ xcodegen"  || echo "❌ xcodegen manquant (brew install xcodegen)"
    @command -v node      > /dev/null && echo "✅ node"      || echo "❌ node manquant"
    @command -v appium    > /dev/null && echo "✅ appium"    || echo "❌ appium manquant (npm i -g appium)"
    @command -v maestro   > /dev/null && echo "✅ maestro"   || echo "❌ maestro manquant (cd maestro && just setup)"
    @command -v just      > /dev/null && echo "✅ just"      || echo "❌ just manquant"

# Afficher l'aide
help:
    @just --list
