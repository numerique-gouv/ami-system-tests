# justfile — AMI E2E tests
# Pré-requis : just, Android SDK (adb, gradle), Xcode, Node.js >= 20

set dotenv-load := true

root := source_directory()

android_project := root / "../ami-app-android"
ios_project     := root / "../ami-app-ios"

android_apk := android_project / "app/build/outputs/apk/staging/debug/app-staging-debug.apk"
ios_derived := ios_project / "build"
ios_app     := ios_derived / "Build/Products/Debug-iphonesimulator/AMI.app"

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
    cd {{ios_project}} && xcodegen generate
    @echo "📦 Build iOS (AMI-Staging / simulateur)…"
    cd {{ios_project}} && xcodebuild \
        -scheme AMI-Staging \
        -configuration Debug \
        -destination 'platform=iOS Simulator,name=iPhone 15,OS=17.0' \
        -derivedDataPath build \
        build \
        | xcpretty || true
    @echo "✅ App générée : {{ios_app}}"

# Builder les deux plateformes
build: build-android build-ios

# ─── Émulateurs / Simulateurs ───────────────────────────────────────────────

android_avd    := "Pixel_modern"
android_sdk    := env_var_or_default("ANDROID_SDK_ROOT", env_var_or_default("ANDROID_HOME", ""))

# Démarrer l'émulateur Android en arrière-plan et attendre le boot complet
#TODO: vérifie qu'il n'est pas déjà lancé avant de le démarrer.
android-start:
    @echo "🤖 Démarrage de l'émulateur {{android_avd}}…"
    {{android_sdk}}/emulator/emulator -avd {{android_avd}} -no-snapshot-save &
    {{android_sdk}}/platform-tools/adb wait-for-device
    @until {{android_sdk}}/platform-tools/adb shell getprop sys.boot_completed 2>/dev/null | grep -q '^1$'; do sleep 2; done
    @echo "✅ Émulateur prêt."

# Arrêter l'émulateur Android
android-stop:
    {{android_sdk}}/platform-tools/adb emu kill || true

# ─── Setup ──────────────────────────────────────────────────────────────────

# Vérifier que les outils nécessaires sont installés
check:
    @echo "🔍 Vérification des pré-requis…"
    @command -v adb       > /dev/null && echo "✅ adb"       || echo "❌ adb manquant (Android SDK)"
    @command -v xcodegen  > /dev/null && echo "✅ xcodegen"  || echo "❌ xcodegen manquant (brew install xcodegen)"
    @command -v xcpretty  > /dev/null && echo "✅ xcpretty"  || echo "⚠️  xcpretty absent (gem install xcpretty — optionnel)"
    @command -v node      > /dev/null && echo "✅ node"      || echo "❌ node manquant"
    @command -v appium    > /dev/null && echo "✅ appium"    || echo "❌ appium manquant (npm i -g appium)"
    @command -v maestro   > /dev/null && echo "✅ maestro"   || echo "❌ maestro manquant (cd maestro && just setup)"
    @command -v just      > /dev/null && echo "✅ just"      || echo "❌ just manquant"

# Afficher l'aide
help:
    @just --list
