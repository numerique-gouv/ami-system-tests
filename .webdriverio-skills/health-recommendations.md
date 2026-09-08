# Recommandations santé projet — ami-system-tests

_Générées par `managing-project-customizations` le 2026-09-08._

## Capacités déjà en place (pas de recommandation)

- **Capture d'artefacts d'échec** : `wdio.base.conf.ts:afterTest` prend déjà un screenshot + DOM snapshot (WebView) ou XML (natif) + liste de sélecteurs interactifs suggérés à chaque test en échec. Conforme à la bonne pratique référencée (webdriverio/webdriverio#2190).
- **Reporter machine-lisible** : le reporter `allure` écrit un `*-result.json` par test dans `allure-results/` — déjà exploitable par script (utilisé pendant l'investigation de flakiness du 2026-09-08 via `python3`/`json.load`). Pas besoin d'un reporter JSON séparé.

## Recommandations ouvertes

### 1. `allure-results/` et `.wdio-logs/*.log` ne sont jamais nettoyés avant un run

- **Constat** : aucun `rm -rf allure-results` ni rotation de `.wdio-logs/appium-*.log` dans le `justfile` avant `test-android`/`test-ios`/`test-webapp`. Les résultats Allure de plusieurs jours et de plusieurs plateformes (android/ios/webapp partagent le même `outputDir`) s'accumulent dans le même dossier ; les logs Appium sont écrasés à chaque process, donc perdus dès qu'on relance.
- **Pourquoi ça compte** : lors d'une investigation post-incident (coupure réseau le 2026-09-08), il a été impossible de dater/isoler proprement les résultats d'un run donné, et les logs Appium du process fautif (chromedriver dans un état dégradé) avaient déjà été écrasés par le process suivant au moment de l'investigation.
- **Piste suggérée** : nettoyer/horodater `allure-results` avant chaque run (`rm -rf allure-results` ou dossier par run), et faire tourner `.wdio-logs/appium-*.log` (suffixe timestamp ou conserver les N derniers). Décision produit à valider avec l'équipe — **volontairement non implémentée** ce jour (l'utilisateur a explicitement demandé de ne pas toucher à `allure-results`).

### 2. Écart de couverture — section "Préférences" de la webapp

- **Constat** : le modèle de site (`references/website-analysis/ami-back-staging.osc-fr1.scalingo.io/website-analysis.md`) montre 3 sous-écrans sous Préférences (`Suivi des démarches`, `Notifications`, `Zones scolaires`) ; aucun test dans `src/tests/mobile/` ne semble cibler ces écrans directement (seuls le consentement API et l'onboarding notifications sont couverts).
- **Pourquoi ça compte** : si ces réglages sont importants pour l'usager (ex. désactivation du suivi par partenaire), une régression y serait actuellement invisible pour la suite de tests.
- **Piste suggérée** : à confirmer avec l'équipe produit si ces écrans sont business-critical ; si oui, prioriser un scénario `preferences.test.ts` dans `src/tests/mobile/`.

### 3. Appels réseau sans timeout dans les helpers `*-api.ts` (partiellement résolu)

- **Constat** : `src/helpers/notifications-api.ts` a été corrigé le 2026-09-08 (ajout de `AbortSignal.timeout(15000)` sur `checkConsent`/`grantConsent`/`publishNotification`) suite à une cascade de hooks en échec causée par un `fetch()` sans timeout pendant une coupure réseau.
- **Pourquoi ça compte** : tout futur helper HTTP ajouté au projet risque de reproduire le même problème si le pattern n'est pas documenté.
- **Piste suggérée** : le pattern est maintenant documenté dans `.webdriverio-skills/custom-rules.md` (§ Environnements / réseau) — vérifier lors des revues de code que tout nouveau `fetch()` dans `src/helpers/` suit ce pattern.
