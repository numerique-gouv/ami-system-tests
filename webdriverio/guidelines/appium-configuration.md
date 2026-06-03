# Configuration Appium et WebdriverIO : réglages non triviaux

## 1. Symptôme

- `switchContext('WEBVIEW_*')` échoue silencieusement (contexte reste `NATIVE_APP`) sur Android.
- `getContexts()` bloque ~10 s par appel sur iOS → le polling de WebView prend plusieurs minutes.
- La session Appium ne démarre pas : `Could not find 'iPhone 15 / iOS 17.0'` (platformVersion hardcodé).
- `UiAutomation connection failed` après boot de l'émulateur depuis un snapshot.
- Les logs COMMAND/DATA/RESULT d'Appium noient les vraies erreurs dans la console.

## 2. Pourquoi

Appium 3 a changé le format de certaines capabilities (`allowInsecure`). Plusieurs valeurs par défaut sont trop optimistes pour les émulateurs/simulateurs (timeouts, webkitResponseTimeout). D'autres paramètres iOS (platformVersion) rendent la config fragile quand Xcode est mis à jour.

## 3. Solution

### Android : `chromedriverAutodownload` en format Appium 3

```typescript
// ✅ Appium 3 : préfixe driver obligatoire dans allowInsecure
args: {
  allowInsecure: 'uiautomator2:chromedriver_autodownload',
}

// ❌ Appium 2 : format sans préfixe (silencieusement ignoré en v3)
args: {
  allowInsecure: 'chromedriver_autodownload',
}
```

Sans ce réglage, `switchContext('WEBVIEW_*')` reste en `NATIVE_APP` sans erreur visible. La capability dans les capabilities de l'app est aussi nécessaire :

```typescript
'appium:chromedriverAutodownload': true,
```

### Android : timeouts étendus pour émulateurs depuis snapshot

```typescript
'appium:uiautomator2ServerLaunchTimeout': 60000,  // défaut ~20s insuffisant
'appium:uiautomator2ServerInstallTimeout': 60000,
```

Les émulateurs AVD avec snapshot chargent l'état mémoire : UiAutomation peut mettre >20 s à se connecter.

### iOS : ne pas hardcoder `platformVersion`

```typescript
// ✅ Appium détecte la version depuis le simulateur connecté
'appium:deviceName': process.env.IOS_DEVICE_NAME ?? 'iPhone 17 Pro',
// platformVersion absent

// ❌ Hardcodé — casse dès que Xcode installe une nouvelle version iOS
'appium:platformVersion': '17.0',
```

### iOS : `webkitResponseTimeout` pour un polling efficace

```typescript
'appium:webkitResponseTimeout': 3000, // défaut ~10s sur simulateur
```

Chaque appel `getContexts()` dans `waitForWebViewContext()` fait un aller-retour WKRDP. Sans ce réglage, chaque tentative prend ~10 s — le polling de 25 s n'a que 2-3 itérations effectives. Avec 3000 ms, on obtient ~8 itérations.

### iOS : `autoAcceptAlerts: false`

```typescript
'appium:autoAcceptAlerts': false, // géré manuellement dans les tests
```

XCUITest peut accepter des alertes système automatiquement. Désactivé pour que les tests gèrent explicitement les permissions push et autres dialogues.

### Ports distincts par plateforme

```typescript
// wdio.android.conf.ts
port: 4723
args: { port: 4723 }

// wdio.ios.conf.ts
port: 4724
args: { port: 4724 }
```

Permet de lancer Android et iOS en parallèle ou en alternance sans conflit de port.

### `logLevel` et Allure

```typescript
// wdio.base.conf.ts
logLevel: 'info', // 'warn' pour les runs CI (supprime COMMAND/DATA/RESULT)

reporters: [
  'spec',
  ['allure', { outputDir: 'allure-results', disableWebdriverStepsReporting: false }],
],
```

`'warn'` supprime les logs Appium bas niveau en production. Passer à `'info'` ponctuellement pour diagnostiquer un test flaky. Allure (`just report`) conserve l'historique des runs avec screenshots automatiques.

### Screenshot automatique sur échec

```typescript
// wdio.base.conf.ts
afterTest: async (test, _context, result): Promise<void> => {
  if (!result.passed) {
    const png = await browser.takeScreenshot()
    const name = test.title.replace(/[^a-z0-9]/gi, '_').slice(0, 80)
    fs.writeFileSync(path.join(dir, `${name}_${Date.now()}.png`), Buffer.from(png, 'base64'))
  }
}
```

Les screenshots sont dans `.wdio-logs/screenshots/` et automatiquement inclus dans le rapport Allure.

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/driver/capabilities.ts:19-41` — capabilities Android avec commentaires.
- `webdriverio/src/driver/capabilities.ts:45-64` — capabilities iOS.
- `webdriverio/wdio.android.conf.ts:19-21` — format Appium 3 `allowInsecure`.
- `webdriverio/wdio.base.conf.ts:37-39` — `logLevel` avec explication.
- `webdriverio/wdio.base.conf.ts:72-80` — hook `afterTest` screenshot.

## 5. Sources

- Commit `fd97e0a` — capabilities iOS (retrait platformVersion, webkitResponseTimeout)
- Commits `a731ede`, `301c6a6` — Allure, logLevel
- [Appium 3 migration guide — allowInsecure format](https://appium.io/docs/en/latest/guides/migrating-1-to-2/)
- [Appium UiAutomator2 — capabilities](https://github.com/appium/appium-uiautomator2-driver#capabilities)
