# Workflow de débogage : observer avant d'écrire

## 1. Symptôme

- Un sélecteur qui "devrait marcher" timeout sans raison apparente.
- On modifie un locator 5 fois en aveugle avant de trouver le bon.
- Un test qui passait hier échoue aujourd'hui sans changement de code (flaky non reproductible).
- Un workaround est commité sans avoir été testé → il casse un autre cas.

## 2. Pourquoi

Les apps hybrides (native + WebView) ont deux arbres d'éléments distincts : l'arbre natif (XCUITest / UIAutomator2) et le DOM web. Un sélecteur CSS ne fonctionne pas en `NATIVE_APP`, un `accessibility id` natif ne fonctionne pas en WebView. Sans observation directe, il est impossible de savoir dans quel contexte on est, ni quelle est la structure réelle.

## 3. Solution : la boucle inspect → run → consigner

### Étape 1 : Inspecter l'écran avant d'écrire un sélecteur

**Android WebView** — utiliser le script d'inspection qui ouvre Chrome DevTools :

```bash
just inspect-android-webview
# Ouvre chrome://inspect dans Chrome, permet d'inspecter le DOM du WebView
```

**iOS simulateur** — utiliser l'inspecteur de vue Appium ou le MCP Maestro :

```typescript
// Depuis le MCP maestro dans Claude Code
mcp__maestro__inspect_screen({ device_id: "..." })
```

**Général** — screenshot à la demande :

```bash
just inspect-android  # screenshot + dump de la view hierarchy
```

### Étape 2 : Tester un sélecteur avant de l'intégrer

Préférer un run inline sur un flow minimal plutôt que d'exécuter tout le fichier de test :

```bash
just test-android-fast grep="mot clé du test à isoler"
```

### Étape 3 : Consigner uniquement ce qui a été vérifié

Ne jamais commiter un workaround hypothétique ("ça devrait marcher avec ce sélecteur"). Tester d'abord, puis commiter avec un message qui décrit le **pourquoi** (bug WKRDP, AX tree périmé, etc.).

### Réglages debug

Pendant une session de débogage :

```typescript
// wdio.base.conf.ts — temporaire, ne pas commiter
logLevel: 'info',      // voit les COMMAND/DATA/RESULT Appium
specFileRetries: 0,    // voir la vraie cause, pas le retry qui masque
```

Ajouter un `afterEach` screenshot si le `afterTest` ne suffit pas :

```typescript
afterEach: async (): Promise<void> => {
  const png = await browser.takeScreenshot()
  fs.writeFileSync(`.wdio-logs/screenshots/debug_${Date.now()}.png`, Buffer.from(png, 'base64'))
}
```

### Idempotence backend en débogage

Si un test publie une notification et qu'on le relance plusieurs fois, le backend peut retourner le même record (idempotence). Utiliser un titre horodaté :

```typescript
// Évite que le backend cache la notification d'un run précédent
const title = `AMI-vanilla-${Date.now()}`
```

Et vérifier la variable `send_date` dans le payload — elle garantit l'unicité côté API même si le titre est identique.

### Ne pas investiguer sans lire les logs Allure

Avant toute session de débogage, regarder :

1. Le rapport Allure (`just report`) — screenshots au moment de l'échec.
2. `.wdio-logs/appium-android.log` ou `appium-ios.log` — erreur exacte d'Appium.
3. Le `logLevel: 'info'` dans la prochaine exécution — voir quelle commande Appium échoue.

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/src/scripts/inspect-android-webview.ts` — script d'inspection WebView Android via Chrome DevTools.
- `webdriverio/src/scripts/inspect-notification-detail.ts` — script d'inspection pour la page de détail notification.
- `webdriverio/wdio.base.conf.ts:37-39` — `logLevel` et son explication.
- `webdriverio/wdio.base.conf.ts:56-59` — `specFileRetries` et la distinction debug/prod.
- `webdriverio/src/tests/notifications.test.ts:45` — horodatage pour idempotence backend.

## 5. Sources

- Plan `.claude/plan-based-on-the-end-to-end-yaml-stateful-hinton.md` — boucle de mise au point
- Plan `.claude/plan-maestro-flows-notifications-receive-van-snappy-ullman.md` — idempotence horodatage
- [Chrome DevTools — Remote Debugging Android WebViews](https://developer.chrome.com/docs/devtools/remote-debugging/webviews/)
- [Appium Inspector](https://github.com/appium/appium-inspector)
