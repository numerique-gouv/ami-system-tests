# WebView Android "ancien" : viser un Chrome nativement ≥ ES2020 (API 29) plutôt que piloter du legacy

## Problème

Tout scénario traversant la WebView de l'app échoue systématiquement sur l'appareil Android
« ancien » (API 28, minSdk), en CI comme en local — symptômes différents selon l'environnement
(`Aucun contexte WEBVIEW_* trouvé`, `Chromedriver exited unexpectedly ... signal SIGTERM`,
`No Chromedriver found...`), mais une seule cause racine.

**Root cause** : les binaires officiels Google ChromeDriver **2.39 à 2.44** (mai-nov. 2018) ont
un bug d'empaquetage — leur `/status` répond `{"build":{"version":"alpha"},...}` au lieu d'un
vrai numéro de version, sans champ `ready`. `appium-chromedriver` (≥7.0.0, janv. 2025) exige
strictement `status.ready === true` ; sans lui, il retente 20× puis tue le process (`SIGTERM`).
Malchance de calendrier : ces binaires cassés couvrent exactement Chrome/WebView 66-69 — pile
la version embarquée par l'appareil ancien (local et CI). Vérifié en lançant ces binaires
nous-mêmes, hors Appium/Android, contre `chromedriver.storage.googleapis.com` : 2.45
(1er binaire corrigé, déc. 2018) répond correctement.

## Pistes écartées

- **`google_apis` ↔ `google_apis_playstore`** : sans effet — Chrome est déjà le provider WebView
  sur l'image x86_64 des runners CI dans les deux cas (c'est l'architecture qui compte, pas le
  tag playstore). L'arm64-v8a local (macos), lui, n'a jamais Chrome, avec ou sans playstore. Et le playstore ne téléchargera pas de mise à jour sans compte google.
- **Forcer `com.google.android.webview` comme provider** (`cmd webviewupdate
  set-webview-implementation`) : rejeté par le système — le WebView Update Service refuse tout
  provider de `versionCode` inférieur au plancher déjà fixé par Chrome.
- **Rosetta 2** (Mac Apple Silicon) : débloque l'exécution des binaires 2.x (Intel-only) mais
  mène ensuite exactement à la même erreur `/status` qu'en CI — ne change rien au fond.
- **Chromedriver le plus récent en cache (v151) + `chromedriverDisableBuildCheck`** : session
  et contexte `WEBVIEW_*` OK, mais échoue à `unable to discover open window in chrome` — ~85
  versions majeures / 7 ans d'écart CDP entre Chrome 66 et Chromedriver 151, protocole de
  découverte des fenêtres trop divergent.
- **Chromedriver 2.45 (1er corrigé) + `chromedriverDisableBuildCheck`** : fonctionnait de bout
  en bout (flux FranceConnect complet validé en local), mais nécessitait en plus d'interdire
  tout optional chaining/nullish coalescing (`?.`/`??`) dans les callbacks
  `driver.execute()`/`browser.execute()` (10 correctifs applicatifs) et de patcher en place le
  bundle `@testing-library/dom` (transpilation `esbuild` via un hook `postinstall`). **Abandonné
  comme trop coûteux à maintenir** : contrainte de codage silencieuse non détectée par le lint,
  patch fragile d'une dépendance tierce à chaque mise à jour.
- **Downgrader `appium-chromedriver`/`appium-uiautomator2-driver`** (évaluation théorique) :
  viable sans cascade sur le serveur Appium/WebdriverIO/Allure, mais nécessiterait un
  `APPIUM_HOME` dédié pour l'appareil ancien (Appium ne fait cohabiter qu'une version par
  driver) — duplication ciblée pour un bénéfice incertain, non retenue.
- **Mettre à jour Chrome vers 80 via Play Store sur l'AVD API 28 existante** : `market://…`
  atterrit sur `UnauthenticatedMainActivity` — Play Store n'installe/ne met rien à jour sans
  compte Google connecté, indisponible sur un émulateur CI éphémère (chantier d'infra à part).

## Décision

Plutôt que de faire fonctionner Chromedriver/Appium *malgré* un WebView Chrome 66-69,
**cibler une image système dont le WebView est nativement ≥ Chrome 80** (V8 8.0, premier à
supporter `?.`/`??` — confirmé via `v8.dev/blog/v8-release-80`, absent de la 79) : ça élimine
le bug binaire, tout contournement Chromedriver, et la contrainte de codage applicatif d'un
coup. Chromedriver étant conçu pour être apparié à la même version majeure que Chrome, Chrome
80 + Chromedriver 80 (résolu automatiquement par `chromedriverAutodownload`, déjà actif, sans
capability supplémentaire) sont nativement compatibles — vérifié en standalone
(`ready:true`, pas de bug "alpha").

Vérifié dans le dépôt AOSP `platform/external/chromium-webview` (commits "WebView AOSP
Integration Request") : Android 10 (`android-10.0.0_r1`) embarque un WebView 74 (< 80),
Android 11 (`android-11.0.0_r1`) embarque 83 (> 80). Mais les images système distribuées par
`sdkmanager` correspondent à des révisions de maintenance bien plus tardives que ce tag `_r1`
de sortie initiale — vérifié en bootant réellement les AVD (arm64-v8a, en local) :
`system-images;android-29;google_apis` et `;android-30;google_apis` embarquent tous deux la
**même** révision, WebView **91.0.4472.114**. **API 29 est donc retenue** (même WebView
qu'API 30, mais plus proche du `minSdk` réel de l'app, 28).

Un test E2E réel (`chromedriverAutodownload` seul, aucune capability spéciale) confirme :
plus aucune trace de la boucle SIGTERM ni du bug "alpha", contexte `WEBVIEW_*` atteint et
piloté normalement — flux FranceConnect complet jusqu'au callback OIDC. L'échec résiduel
observé est une assertion UI ordinaire, sans rapport avec cette investigation.

**Réserve non levée** : ces vérifications sont faites en arm64 (rapide, natif, local), pas en
x86_64 (architecture réelle des runners CI) — un écart de version WebView entre architectures a
déjà été observé sur l'API 28 (66 en arm64 vs 69 en x86_64). Vu la marge (91 très au-dessus du
seuil 80), la conclusion qualitative est jugée solide mais reste à confirmer par un run CI réel.

### Configuration retenue

`.github/actions/e2e-android/action.yml` : un step de résolution unique fixe, selon
`run_old_device`, les variables `ANDROID_DEVICE_NAME`/`ANDROID_API_LEVEL`/`ANDROID_TARGET`/
`ANDROID_ARCH`/`ANDROID_PROFILE` via `$GITHUB_ENV`, réutilisées par les 3 steps suivants (cache
AVD, création AVD + snapshot, Tests E2E) — remplace 6 steps dupliqués (3 par branche
ancien/récent) par 3 steps paramétrés. `ANDROID_DEVICE_NAME` sert à la fois de nom d'AVD et de
valeur lue par `just`/`capabilities.ts` (`appium:deviceName`) — une seule variable.

| | Ancien (retenu) | Récent (inchangé) |
|---|---|---|
| API level | 29 (Android 10) | 36 |
| target | google_apis | google_apis |
| arch | x86_64 | x86_64 |
| profile | pixel_2 | pixel_8 |
| avd-name | pixel_2_api29 | pixel_8_api36 |

`src/driver/capabilities.ts` reste sur sa configuration d'origine — `chromedriverAutodownload:
true` seul, aucun override, aucun correctif applicatif requis.

Effet de bord corrigé en cours de route : `justfile` (`android_avd`) ignorait
`ANDROID_DEVICE_NAME` et bootait toujours `Pixel_modern` en local quel que soit l'AVD demandé —
corrigé (`env_var_or_default("ANDROID_DEVICE_NAME", "Pixel_modern")`).

## Statut

Configuration committée, **pas encore vérifiée par un run CI réel** (x86_64) — prochaine étape
avant de clore le sujet. Si le WebView réel en CI s'avère finalement < 80, revenir à cet ADR :
le downgrade de driver (`APPIUM_HOME` dédié) reste une option de repli documentée ci-dessus, ou
accepter de retirer la couverture WebView de l'appareil ancien.

## Notes

- Les commandes de diagnostic (dump WebView, log Appium `debug` avec
  `appium:showChromedriverLog`, dump `logcat` complet) restent actives dans `action.yml` —
  décisives pour dater précisément le bug ChromeDriver, à conserver tant que le sujet n'est pas
  clos.
- Un `dumpsys webviewupdate` propre ne garantit rien sur la capacité d'Appium à piloter la
  WebView — piège à ne pas répéter : seule l'exécution réelle d'un test fait foi.
