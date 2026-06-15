# Réinitialisation de l'état device : toujours hors du test

## 1. Symptôme

- Le test suivant trouve des cookies WebKit d'une session précédente → login automatique non voulu.
- Appium ne peut pas démarrer : `UIAutomation session already registered` (Android).
- Les notifications d'un run précédent sont déjà dans l'inbox → l'assertion de comptage échoue.
- Sur iOS, `SFSafariViewController` cache les tokens d'une session FC précédente.

## 2. Pourquoi

Les tests E2E supposent une ardoise propre au démarrage. Mais l'état pollué peut venir de plusieurs sources :

| Source | Plateforme | Impact |
|---|---|---|
| Cookies WebKit / WKWebView persistés | iOS | Login automatique, tokens périmés |
| `SFSafariViewController` persisté | iOS | Tokens FC d'une ancienne session |
| Library de l'app (préférences, base) | iOS + Android | Onboarding déjà passé |
| Session UiAutomation stale (Maestro ou run précédent) | Android | `already registered` → Appium ne démarre pas |
| APK Maestro enregistré comme IAccessibilityServiceClient | Android | Conflit `system_server` |

Les tests ne peuvent pas appeler `xcrun simctl` depuis un processus XCUITest, et l'appel `adb` depuis un test rend les tests non portables. La réinitialisation doit donc être externe.

## 3. Solution

### iOS : nettoyage via le justfile

Le nettoyage iOS est invoqué par `just test-ios-notifications` (ou équivalent) **avant** le lancement de WDIO. Il utilise `xcrun simctl` depuis le shell :

```bash
# justfile (exemple)
test-ios-notifications:
  # Nettoie les tokens FC persistés dans SFSafariViewController
  xcrun simctl privacy {{ ios_udid }} reset all
  # Supprime Library de l'app (préférences, base SQLite, cache WebKit)
  xcrun simctl get_app_container {{ ios_udid }} {{ bundle_id }} data | xargs rm -rf
  # Lance les tests
  just _test-ios
```

Le test se contente de `fullReset: false` dans les capabilities — Appium réinstalle l'app proprement.

### Android : nettoyage dans `beforeSession`

Sur Android, le nettoyage est dans le hook `beforeSession` de `wdio.android.conf.ts` car il doit cibler le device connecté dynamiquement :

```typescriptx
// wdio.android.conf.ts
beforeSession(): void {
  // Force-stop les APKs UiAutomator2 stale
  execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server.test'])
  execFileSync(adb, ['shell', 'am', 'force-stop', 'io.appium.uiautomator2.server'])
  // Maestro laisse un IAccessibilityServiceClient enregistré dans system_server
  execFileSync(adb, ['shell', 'am', 'force-stop', 'dev.mobile.maestro'])
  execFileSync(adb, ['shell', 'am', 'force-stop', 'dev.mobile.maestro.test'])
}
```

Le chemin `adb` est résolu dynamiquement depuis `ANDROID_HOME` ou `ANDROID_SDK_ROOT`.

### Règle générale

> Un test ne fait jamais `xcrun simctl` ni `adb`. Il s'appuie sur l'environnement préparé par `just`.

Cette règle garantit que les tests sont portables (CI, machines différentes) et que la chaîne de préparation est documentée dans un seul endroit (le justfile).

### Idempotence backend : horodatage unique

Pour les tests qui publient des données (notifications, posts), la réinitialisation ne suffit pas si le backend fait un `get_or_create` sur le payload. Utiliser un identifiant unique à chaque run :

```typescript
// ✅ Titre unique à chaque run → le backend crée toujours un nouveau record
const title = `AMI-vanilla-${Date.now()}`

// ❌ Titre fixe → le backend retourne le record existant → la notification est déjà dans l'inbox
const title = 'Test notification AMI'
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/wdio.android.conf.ts:29-47` — hook `beforeSession` avec force-stop des APKs.
- `webdriverio/src/tests/notifications.test.ts:45` — `AMI-vanilla-${Date.now()}` pour l'idempotence.
- `webdriverio/src/helpers/notifications-api.ts:39` — `send_date: new Date().toISOString()` dans le payload (même protection côté API).

## 5. Sources

- Plan `.claude/plan-based-on-the-end-to-end-yaml-stateful-hinton.md` — reset iOS via simctl
- Commit `301c6a6` — hook beforeSession Android (kill UiAutomation + Maestro)
- [Appium — UIAutomator2 "already registered" issue](https://github.com/appium/appium-uiautomator2-driver/issues/584)
- [xcrun simctl privacy](https://keith.github.io/xcode-man-pages/simctl.1.html)
