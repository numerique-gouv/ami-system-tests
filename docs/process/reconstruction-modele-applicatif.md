# Reconstruction du modèle applicatif (webapp + écrans natifs)

## Objet et non-objet

Ce document décrit **comment** on reconstruit le modèle des écrans à tester de l'app AMI (webapp, WebView Android, WebView+natif iOS) à partir d'apps fraîchement buildées. Il ne contient **pas** le modèle lui-même : le résultat vit dans `references/website-analysis/<target>/website-analysis.{md,json}` (miroir dans `.webdriverio-skills/website-analysis.{md,json}`). Ne pas dupliquer ce contenu ici — si une information appartient au modèle (une route, un composant, un état), elle va dans `website-analysis.md`, pas dans cette note.

Ce fichier a un nom stable (pas daté comme un ADR) car il sera relu et mis à jour à chaque exécution du process, contrairement à une décision d'architecture figée. Voir § Automatisation pour le skill qui rejoue ce process.

## Déclencheurs

Relancer ce process quand :
- une nouvelle version de la webapp SvelteKit est déployée (`../ami-notifications-api/public/mobile-app`) ;
- un nouveau build Android ou iOS est disponible ;
- un écran natif a été refondu (onboarding, écran FranceConnect, picker de review) ;
- avant d'écrire des tests sur une zone dont on soupçonne qu'elle n'est plus à jour dans le modèle.

## Prérequis

- `.env.local` rempli (`AMI_ENV`, `NOTIF_*`) — ne jamais lire ni afficher son contenu, y compris via un outil.
- Émulateur/simulateur démarrés : `just start-android` / `just start-ios`.
- Build à jour : `just build-android` / `just build-ios` (vérifie la présence du binaire, ne le construit pas — le build lui-même se fait dans les dépôts frères `ami-app-android`/`ami-app-ios`).
- Un compte de test FranceConnect sandbox disponible (`src/helpers/test-users.ts`).

## Étape A — Webapp

Déléguer au skill `analyze-website` (déjà existant dans `.claude/skills/`) sur l'URL de staging (`baseUrl` de `wdio.webapp.conf.ts`, dérivée de `AMI_ENV` via `resolveEnvironment()`). Il combine exploration live (Chrome) et lecture du code source SvelteKit du dépôt frère. Résoudre `<target>` = host en minuscules, sans protocole ni slash final (ex. `ami-back-staging.osc-fr1.scalingo.io`).

## Étape B — Écrans natifs Android puis iOS

`analyze-website` ne couvre pas les écrans hors WebView. Pour ceux-ci :

1. Écrire un script WDIO/Appium **temporaire et jetable** (jamais commité), placé provisoirement sous `src/tests/mobile/_tmp-native-screens-explore-<plateforme>.test.ts` pour bénéficier de la résolution TypeScript du projet (`tsconfig.json` n'inclut que `src/**/*.ts`).
2. Ce script **réutilise les Page Objects existants** (`EnvironmentPickerPage`, `FranceConnectMirePage`, `FranceConnectEidasPage`, `FranceConnectCredentialsPage`, `OnboardingNotificationsPage`, etc.) — jamais de sélecteur ad hoc écrit pour l'occasion.
3. Il prend une capture d'écran (`browser.takeScreenshot()`) après chaque étape de la séquence de démarrage (cold start → picker de review → mire FranceConnect → eIDAS → identifiants → onboarding notifications → home), écrite dans `.wdio-logs/native-screens-{android,ios}/NN-nom-etape.png`.
4. Lancer via `just test-android "<chemin>"` / `just test-ios "<chemin>"` (jamais `npx wdio`/`appium` en direct).
5. **Supprimer le script après avoir lu les captures** — vérifier `git status` pour confirmer qu'aucune trace ne reste avant de continuer.

Le chemin du build iOS a changé au moins une fois (voir Journal ci-dessous) — si `just build-ios`/`just test-ios` échoue à trouver l'app, vérifier d'abord `ios_derived` dans `justfile` et `IOS_APP_PATH` dans `src/driver/capabilities.ts` avant de suspecter autre chose.

## Étape C — Consolidation

Fusionner les preuves natives dans les sections dédiées de `website-analysis.md` (« Composants transverses (natif, hors WebView) »), avec pour chaque écran : nom, fichier source du dépôt frère (Kotlin/Swift), nature de la preuve (« capture live » vs « code seul »), et **date d'observation**. Mettre à jour aussi `website-analysis.json` (`nativeScreens`) et recopier les deux fichiers dans `.webdriverio-skills/`.

## Règles de preuve

Reprise de CLAUDE.md § Documentation : toute affirmation doit être fondée sur une preuve capturée ou observée ; ce qui ne l'est pas est marqué **non confirmé** dans une section dédiée, jamais présenté comme un fait. Exemple concret rencontré : lors de l'exploration du 2026-09-08, la sheet d'onboarding notifications iOS est restée visible après le 2ᵉ `tapFranceConnect()` au lieu d'atteindre la home. Ce constat a été consigné comme anomalie **non expliquée** — il n'a **pas** été rattaché au bug de concurrence OIDC FranceConnect (confirmé par ailleurs comme implémenté par une équipe tierce, hors code AMI) faute de preuve suffisante pour établir ce lien.

## Limites connues de la méthode

- L'écran natif d'erreur réseau Android (`networkManager/WifiErrorScreen.kt`) n'est pas atteignable sans couper la connectivité de l'émulateur en cours de session — non tenté par défaut pour ne pas déstabiliser une exploration par ailleurs fiable.
- FCM (Android) et APNs (iOS) ne sont pas observables sans notification push réelle.
- Les écrans natifs iOS `Presentation/Settings/SettingsView.swift` et `Presentation/Partner/PartnerView.swift` ne sont pas atteints par la séquence de démarrage — il faudrait naviguer plus loin dans l'app authentifiée.
- Les formulaires d'édition du profil (`/edit-address`, `/edit-email`, `/edit-preferred-username`) ne sont pas ouverts en live par défaut, pour ne pas modifier les données du compte de test partagé entre exécutions.

## Sorties et consommateurs

| Fichier | Rôle | Consommateurs |
|---|---|---|
| `references/website-analysis/<target>/website-analysis.md` | Modèle lisible (sections, composants, importance, non-confirmés) | Skills `creating-test-structure`, `writing-webdriverio-code`, humains |
| `references/website-analysis/<target>/website-analysis.json` | Modèle structuré | Automatisation (skill du § Automatisation) |
| `.webdriverio-skills/website-analysis.{md,json}` | Miroir pour lecture cross-skill | Tous les skills WDIO du projet |
| `.wdio-logs/native-screens-{android,ios}/*.png` | Captures brutes (non versionnées) | Preuve de travail pendant la session, à ne pas archiver |
| Cette note (`docs/process/reconstruction-modele-applicatif.md`) | Méthode + journal | Quiconque relance le process |

## Journal des exécutions

| Date | Cibles | Repères dépôts frères | Écarts trouvés |
|---|---|---|---|
| 2026-09-08 | Webapp (Chrome, staging), Android (émulateur `Pixel_modern`), iOS (simulateur `iPhone 17 Pro`) | `ami-notifications-api` (SvelteKit, routes lues en code), build Android existant, build iOS reconstruit pendant la session | Chemin de build iOS obsolète dans `justfile`/`capabilities.ts` (corrigé) ; écran FranceConnect natif plein écran sur Android vs rendu WebView sur iOS ; onboarding notifications = écran plein Android vs sheet modale SwiftUI iOS ; anomalie non expliquée (sheet iOS visible après 2ᵉ `tapFranceConnect`) ; écart de couverture Préférences (Suivi des démarches/Notifications/Zones scolaires) |

## Automatisation

Ce process en 4 phases (reconstruction du modèle → audit des guidelines → enrichissement des Page Objects/locators → proposition de cas de test) est destiné à être rejoué par le skill **`reconstructing-app-model`** (`.claude/skills/reconstructing-app-model/SKILL.md`), qui encode les mêmes étapes avec des points d'interview utilisateur intégrés (validation du diff de modèle, arbitrage des changements de guidelines, cas ambigus de locators, priorisation des nouveaux cas de test).
