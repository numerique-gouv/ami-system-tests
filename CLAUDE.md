# CLAUDE.md

Tests E2E mobiles (iOS + Android) et webapp (Chrome) de l'application AMI. Stack : WebdriverIO 10 + Appium 3 + TypeScript. Les apps testées sont dans les dépôts frères `../ami-app-android` et `../ami-app-ios`.

Ce fichier est court exprès : il dit où chercher. Lire le document qui correspond à la tâche, pas tous.

| Pour… | Lire |
|---|---|
| installer, lancer un test, comprendre la CI | [README.md](README.md) |
| écrire ou modifier du code ou un test | [CONTRIBUTING.md](CONTRIBUTING.md) (à lire avant d'écrire du code) |
| comprendre un choix d'architecture | `docs/adr/` |
| trouver une commande | `just --list` (chaque cible a son usage documenté) |

## Rôle des tests

- **Mobile (Android + iOS)** : les écrans natifs et les passages entre le natif et la WebView (bouton FranceConnect natif vers la page de login de la SPA, onboarding, déconnexion). Seul le mobile peut le vérifier.
- **Webapp (Chrome)** : naviguer loin et vite dans les pages de la SPA, sans émulateur ni simulateur.
- Des pages de la SPA passeront en natif au fil du temps : la frontière natif / WebView n'est pas figée.

## Commandes

```bash
just check-code                  # lint + typecheck, avant tout commit
just test-webci                  # tests webapp, headless
just test-android --suite mobile_short
just failures-text               # tests en échec du dernier run
just doctor                      # diagnostic de l'environnement
```

Un agent peut aussi lancer directement `npm`, `npx wdio`, `adb`, `xcrun`.

## Skills

Un skill est un mode d'emploi que Claude charge à la demande (outil `Skill`, ou `/nom-du-skill`). Ils sont dans `.claude/skills/`. Le code écrit doit être conforme aux bonnes pratiques et aux guides de la documentation officielle de WebdriverIO (webdriver.io et les dépôts github.com/webdriverio), d'Appium et de Mocha, ainsi qu'à [CONTRIBUTING.md](CONTRIBUTING.md) : charger le skill correspondant à la tâche plutôt que de deviner.

La plupart viennent du pack `klamping/webdriverio-skills`, réinstallable par `npx skills add klamping/webdriverio-skills`. Une édition sur place d'un de ces `SKILL.md` est écrasée à la réinstallation. `reconstructing-app-model` est propre à ce projet : à préserver.

| Skill | Quand |
|---|---|
| `wdio-session` | explorer une app ou une page en direct (snapshot, clic, contextes) et en tirer un test |
| `wdio-v10-migration` | migrer de WebdriverIO 9 vers 10 |
| `writing-webdriverio-code` | écrire ou corriger du code de test WDIO (sélecteurs, attentes, assertions) |
| `creating-test-structure` | partir d'un plan de test en markdown pour poser describe / it / hooks |
| `running-webdriverio-tests` | lancer des specs en ligne de commande pour déboguer |
| `investigate-failing-tests`, `gathering-context` | diagnostiquer un test en échec |
| `analyzing-test-flakiness` | mesurer l'instabilité sur plusieurs répétitions |
| `skipped-test-manager` | sauter temporairement un test en échec en suivant le ticket |
| `analyze-website` | documenter la structure d'un site (utilisé par `reconstructing-app-model`) |
| `managing-project-customizations` | initialiser ou rafraîchir le contexte projet en cache (`.webdriverio-skills/`) |
| `reconstructing-app-model` | une app (webapp, Android ou iOS) a changé : re-dériver le modèle applicatif, Page Objects et locators à partir de preuves live, plutôt que de les éditer à la main |

Un écart entre le modèle en cache (`.webdriverio-skills/`) et l'état réel d'une app justifie de relancer `reconstructing-app-model`, même sans test en échec.

## Règles pour l'agent

- Ne jamais affirmer qu'un travail est terminé ou que les tests passent sans les avoir exécutés et vérifié le résultat. Pas de long résumé de statut : confirmer les résultats réels.
- Les locators s'appuient sur le DOM rendu réel et l'accessibilité, pas sur des valeurs codées en dur (pas de `/suivi` en dur, pas de traversée arbitraire de `parentElement`) : inspecter le HTML avant de choisir.
- Documentation, diagrammes et tableaux : seulement ce qui est capturé ou observé. Ce qui est inconnu est marqué « non confirmé », sans acteur ni relation inventés.
- Secrets : `AMI_ENV` et `NOTIF_*` sont dans `.env` (non commité, gabarit `.env.example`). Ne jamais lire ni afficher `.env`, ni écrire une valeur secrète dans le code ou un cache.
