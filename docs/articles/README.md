# Tests système E2E sur AMI — série d'articles

Cinq articles, écrits dans un esprit *build in public / build in community* à destination de la
DINUM et des partenaires du service public, sur la mise en place des tests système E2E d'AMI :
pourquoi, avec quel outil, selon quels patterns, sur quel terrain technique, et branchés à quelle
intégration continue.

**Thèse directrice** : les tests système E2E ne sont pas un gate de déploiement, ce sont un
bouclier pour le temps humain de recette. On peut livrer avec des tests cassés en attendant que les
évolutions fassent aussi évoluer les tests — ce qu'on exige, c'est que quand ils sont verts, la
personne qui fait la recette ne perde pas son temps sur des acquis, et se concentre sur les
nouveautés.

## Sommaire

| # | Titre | Angle | Statut |
|---|---|---|---|
| 1 | [Pourquoi des tests système, sur AMI](01-pourquoi-des-tests-systeme.md) | La montée dans la pyramide de tests, par nécessité et non par doctrine — jusqu'au mur qu'aucun test unitaire ni d'intégration ne couvrait. | brouillon (attend une contribution de Nicolas sur la thèse) |
| 2 | [Choisir son outil de tests E2E](02-choisir-son-outil-e2e.md) | Quatre candidats, un seul critère : la maintenabilité face aux cas complexes. Playwright et ses variantes, Maestro le déclaratif productif, WebdriverIO le choix assumé. | brouillon |
| 3 | [Un corpus, trois runtimes](03-patterns-un-corpus-trois-runtimes.md) | Un seul corpus de scénarios, exécuté sur webapp, Android et iOS sans duplication — grâce au POM à trois niveaux, à un adaptateur de plateforme minimal, et aux suites en session partagée. | brouillon |
| 4 | [Le terrain WebView et OIDC](04-le-terrain-webview-oidc.md) | Ce que personne ne raconte parce que ça n'arrive qu'en faisant : arbre d'accessibilité paresseux, stale element, blocages iOS de 25 secondes. | brouillon |
| 5 | [Une CI qui informe, pas une CI qui bloque](05-integration-continue-et-rapports.md) | Pourquoi un test rouge n'échoue pas le job, le deadlock Scalingo rencontré en réel, et l'historique Allure à deux artifacts. | brouillon |

## Note de méthode

Chaque article ne contient que des faits vérifiables dans le dépôt ou dans les ADR
(`docs/adr/`) — dates, chiffres, citations. Les points non confirmés au moment de l'écriture sont
signalés comme tels plutôt que présentés comme acquis. Chaque fichier porte en front-matter la
liste des sources qui l'étayent.

Cette série ne couvre pas : le backlog de scénarios non encore exécutés
(`src/tests/next/`), ni les écarts de configuration mineurs relevés pendant la préparation
(documentation locale, scripts de build) — hors périmètre éditorial, sans impact sur ce qui est
décrit ici.

our les guidelines, ce n'est vraiment pas figé mais je dirais :

1. publiques visé -> on aura en effet des tech ET des non tech mais je pense que c'est ok si tes articles sont en priorité dédiés à un public tech qui comprend les termes techniques et a envie d'aller dans le détail
1. quel ton, quelle longueur, ... -> pas de taille d'article figée, j'essaie de faire environ 1100 mots en général car c'est une vieille habitude édito et une taille d'article assez appréciée en général par les lecteurs, mais l'idée est plutôt de raconter ce que tu as à raconter - si c'est plus ou moins long c'est pas grave. Sur la tonalité je repasserai dessus si besoin, écris comme tu le sens :)
1. tout critère d'évaluation que tu trouve utile -> je pense que l'essentiel est de se poser la question :
> "quel(s) message(s) clé je veux transmettre à travers l'article" (conseils, apprentissages, convictions, etc)
> "quelles sont les grandes étapes de l'article, quelle linéarité dans ce que je raconte" (une bonne pratique est d'aller du global vers le complexe, autrement dit partir d'une vision générale / systémique du sujet et ensuite d'aller dans le détail si besoin
> "est-ce que je donne des exemples actionnables et concrets pour illustrer chaque message clé"

