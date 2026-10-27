# ADR 2026-10-27 — Blocage WebKit/WDA sur iOS : expériences menées et réglages sans effet

Statut : constat (pas de correction définitive). Source : 52 runs iOS du 2026-10-26/27, un fichier de spec, `specFileRetries=0`, rapport brut (non suivi) `investigations/campagne-2026-10-26/webkit/` (un `summary.txt` et un `appium-ios.log` par `iN-*/run-M/`).

## Mécanismes observés

Une seule famille : une commande RemoteDebugger est envoyée à une target WebKit détruite quelques ms plus tard ; sa réponse n'arrive jamais.

- (a) `Inspector.enable` envoyé à une target PROVISOIRE détruite 22-84 ms après : verrou d'initialisation tenu 180 s, blocage d'environ 17 min (runs `i0-baseline/run-1`, `i1-safarilog/run-2`, `run-4`, `i2-depth30/run-*`… : durée 1011-1036 s, « 2 passing, 5 failing »).
- (c) `Runtime.evaluate` (findElements) en vol lors du remplacement de target : atome expiré à 120 s, au sélecteur d'environnement ou au clic FranceConnect (runs de 150-200 s, « 9 failing »).
- La cause racine côté `appium-remote-debugger` n'est PAS démontrée ; le déclenchement est une course temporelle avec les commandes envoyées par les tests.

## Réglages essayés sans effet

| Réglage | Expérience (dossier de runs) | Résultat |
|---|---|---|
| `appium:safariLogAllCommunication` | `i1-safarilog` (5 runs) | diagnostic seulement, mêmes échecs |
| `settings[snapshotMaxDepth]=30` | `i2-depth30` (3) | 3 blocages de 17 min |
| `settings[customSnapshotTimeout]=5` | `i3-snaptimeout5` (3) | aucun changement |
| `appium:wdaStartupRetries=4` | `i4-wdaretries4` (3) | aucun changement |
| service de trace désactivé | `i5-trace-off` (5) | 5 échecs sur 5 |
| sondage `getUrl` | `i6-urlpoll` (3) | hypothèse réfutée : le blocage précède le clic |
| `appium:webkitResponseTimeout` (3000 puis 10000) | `i0-baseline` (3000, valeur alors suivie), `i7-webkit10000` (3) | aucun changement ; capability ABSENTE de `appium-xcuitest-driver` 12.12.4 / `appium-remote-debugger` 17.4.2 et de 12.21.0 / 17.7.13 (recherche de la chaîne dans `~/.appium/node_modules/appium-xcuitest-driver`, y compris ses dépendances : aucune occurrence) |

Les vraies options du driver sont `appium:webviewConnectTimeout` et `appium:webviewConnectRetries`. Elles n'ont pas été mesurées. La capability `webkitResponseTimeout` et ses commentaires ont été retirés du code suivi.

## Ce qui reste ouvert

- Mise à jour des drivers faite (xcuitest 12.21.0) : amélioration non établie (cf. mémoire/campagne U1).
- Une attente légère avant de quitter une page ou d'enchaîner une commande (mécanismes a et c) est à l'étude ; non mesurée à la date de cette ADR.
- Acceptation des notifications iOS : régression d'`authentication` corrigée par 3479986 (hors sujet de cette ADR).

## Ce qui a un effet démontré et est conservé

Un seul `platform().inWebContext()` englobant pour tout le flow OIDC FranceConnect sur iOS (commit b31a755).
