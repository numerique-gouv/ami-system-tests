# Allure : enrichir les rapports pour un débogage rapide

## 1. Symptôme

- Le rapport Allure montre une liste de commandes Appium sans contexte métier — impossible de savoir à quelle étape du scénario l'échec s'est produit.
- Les screenshots au moment de l'échec sont présents mais non rattachés à une étape.
- En CI, les logs Appium critiques (erreur de connexion WebView, timeout context switch) ne sont pas capturés dans le rapport.
- Pour un test long (login OIDC + inbox + clic), impossible de localiser visuellement quelle action a échoué.

## 2. Pourquoi

`@wdio/allure-reporter` est configuré dans ce projet et génère automatiquement un rapport
à partir des commandes WebdriverIO. Mais sans enrichissement manuel, le rapport ne montre
que les commandes bas niveau (`click`, `findElement`…) sans les structurer autour des
étapes métier du scénario.

L'enrichissement via `AllureReporter` permet :
- De grouper les commandes par **étape métier** (login, ouverture inbox, assertion).
- De **catégoriser** les tests par feature, sévérité, et story pour filtrer en CI.
- De capturer les **logs Appium** pour diagnostiquer les erreurs de session ou de context switch.
- D'**attacher des données** utiles (réponse API, URL courante) directement dans le rapport.

## 3. Solution

### Configuration actuelle (wdio.base.conf.ts)

```typescript
reporters: [
  'spec',
  ['allure', {
    outputDir: 'allure-results',
    disableWebdriverStepsReporting: false, // ← commandes WDIO visibles
    addConsoleLogs: true,                  // ← activé par défaut (logs console.log/warn/error)
  }],
],
```

`addConsoleLogs: true` est **activé par défaut** dans ce projet. Il inclut les logs
`console.log/warn/error` dans le rapport Allure — utile pour tracer les context switches
et les erreurs réseau côté SPA.

### Étapes métier avec `addStep`

```typescript
import AllureReporter from '@wdio/allure-reporter'

it("reçoit une notification dans l'inbox", async () => {
  AllureReporter.addStep('1. Login FranceConnect')
  await LoginPage.reviewEnvironmentPicker()
  await LoginPage.tapFranceConnect()
  await FranceConnectPage.loginWithSandbox()

  AllureReporter.addStep('2. Passe l\'onboarding notifications')
  await OnboardingNotificationsPage.dismiss()

  AllureReporter.addStep('3. Ouvre l\'inbox')
  await HomePage.waitForSpaReady()
  await NotificationsInboxPage.openFromHome()

  AllureReporter.addStep('4. Publie la notification via API')
  const title = `AMI-vanilla-${Date.now()}`
  await publishNotification({ title, body: '...' })

  AllureReporter.addStep('5. Vérifie la réception dans l\'inbox')
  await NotificationsInboxPage.waitForNotification(title)
  await NotificationsInboxPage.clickNotification(title)
  expect(await NotificationsInboxPage.getDetailTitle()).toEqual(title)
})
```

Chaque étape regroupe dans Allure les commandes qui lui appartiennent,
avec un indicateur pass/fail par étape.

### Labels pour filtrer et prioriser

```typescript
// Dans le describe ou en début de it()
AllureReporter.addFeature('Notifications')
AllureReporter.addSeverity('critical')        // blocker | critical | normal | minor | trivial
AllureReporter.addStory('Réception in-app')   // sous-feature
AllureReporter.addTag('smoke')                // tags libres pour les runs sélectifs
```

Résultat dans Allure : filtrage par feature/sévérité, suivi des flaky par story.

### Attachements pour données de débogage

```typescript
// Attacher la réponse API en cas d'échec de publication
try {
  await publishNotification({ title, body })
} catch (err) {
  AllureReporter.addAttachment('Erreur API', String(err), 'text/plain')
  throw err
}

// Attacher l'URL courante pour diagnostiquer un redirect OIDC bloqué
const url = await driver.getUrl().catch(() => 'N/A')
AllureReporter.addAttachment('URL courante', url, 'text/plain')
```

### Screenshot manuel sur étape critique

Le hook `afterTest` capture déjà un screenshot au moment de l'échec.
Pour un screenshot à une étape précise (avant un clic fragile) :

```typescript
const png = await browser.takeScreenshot()
AllureReporter.addAttachment('WebView avant clic FC', png, 'image/png')
```

### Générer et ouvrir le rapport

```bash
just report
# équivaut à : allure generate allure-results --clean -o allure-report && allure open allure-report
```

## 4. Où c'est appliqué dans le dépôt

- `webdriverio/wdio.base.conf.ts:51-54` — configuration Allure (reporters).
- `webdriverio/wdio.base.conf.ts:72-96` — hook `afterTest` avec screenshot + attachement Allure + DOM snapshot WebView.
- `webdriverio/justfile:report` — cible pour ouvrir le rapport.


## 5. Sources

- [WebdriverIO — Allure Reporter](https://webdriver.io/docs/allure-reporter/)
- [Allure Report — WebdriverIO Configuration](https://allurereport.org/docs/webdriverio-configuration/)
- [Allure Report — Decorators and Steps](https://allurereport.org/docs/reference-javascript/)
