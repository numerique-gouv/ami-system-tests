---
title: Une CI qui informe, pas une CI qui bloque
date: 2026-09-01
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 5
statut: brouillon
sources:
  - docs/adr/2026-08-04-Integration-continue-Github-Actions.md
  - .github/workflows/workflow-e2e-main.yml
  - .github/workflows/workflow-e2e-ios.yml
  - .github/actions/e2e-webapp/action.yml
  - .github/actions/e2e-android/action.yml
  - wdio.base.conf.ts
  - allurerc.mjs
---

# Une CI qui informe, pas une CI qui bloque

## Le choix qui surprend au premier regard

Dans `.github/actions/e2e-android/action.yml` et `e2e-webapp/action.yml`, la commande qui lance les
tests se termine ainsi :

```yaml
run: just test-android-suite "${{ inputs.suite }}" || echo "Test suite has failed"
```

Un test rouge ne fait pas échouer le job. À première vue, ça ressemble à un oubli. Ce n'en est pas
un — c'est la même thèse que celle qui ouvre cette série : **le test système protège le temps
humain de recette, il n'arbitre pas le droit de déployer.** On peut livrer avec des tests cassés en
attendant que la suite rattrape une évolution. Ce que la CI garantit, en échange, c'est que le
rapport Allure dit toujours la vérité — et que quelqu'un le regarde.

C'est un choix qui a un coût : il déplace la responsabilité du gate depuis la machine vers l'équipe.
Le reste de cet article montre comment cette CI est bâtie pour que ce déplacement reste tenable.

## Ce qui tourne aujourd'hui, et ce qui ne tourne pas encore

Trois fichiers de workflow sont actifs : `workflow-e2e-main.yml`, `workflow-e2e-ios.yml` et
`allure-cleanup.yml`. `workflow-e2e-main.yml` réunit webapp et Android dans **un seul job, sur une
seule VM** — même checkout, mêmes `node_modules`, même rapport Allure. Un commentaire du fichier
l'explique noir sur blanc :

> *« webapp + android partagent un seul job (même VM, même checkout, même node_modules, même
> allure-report). iOS a besoin d'un macOS (10x plus cher qu'Ubuntu), donc d'une autre VM. »*

C'est un chiffre vérifié : un runner `macos-latest` coûte environ 0,062 $/minute contre 0,006 $/min
pour un Linux 2-core — un facteur dix, sur un dépôt privé donc réellement facturé. `iOS` reste un
stub (`echo "hello world of iOS"`), volontairement pas développé plus loin pour ne pas engager le
coût macOS avant d'en avoir besoin. Le téléchargement de son rapport, dans le workflow principal,
est encore un `echo TODO`. Ce n'est pas caché : c'est une décision économique assumée, réversible
dès que le besoin se présentera.

## Le deadlock qu'on a vraiment rencontré

Le meilleur récit de l'ADR CI n'est pas une décision de conception, c'est un incident réel. Le
déploiement AMI passe par Scalingo, qui attend que tous les checks GitHub d'un commit soient au vert
avant de déployer. Le job E2E, lui, attendait qu'un check GitHub existe et confirme que Scalingo ait
fini de déployer — sauf que ce check apparaissait dès l'ouverture de la PR, avant même d'avoir
attendu quoi que ce soit. Résultat :

> *« Scalingo attend donc un check qui attend lui-même Scalingo : cercle qui ne se dénoue que par
> le mauvais bout. »*
> — `docs/adr/2026-08-04-Integration-continue-Github-Actions.md`

La sortie de ce cercle n'a pas consisté à durcir l'attente côté E2E, mais à la retirer du chemin que
Scalingo observe. Le job E2E, côté dépôt frère `ami-notifications-api`, est désormais déclenché par
l'événement GitHub `on: status` — il ne se lance qu'une fois le statut de déploiement Scalingo
réellement posté sur le commit, en succès ou absent, plutôt que d'exister par avance en attendant
que ce statut arrive. Le test système ne peut plus courir contre un déploiement qui n'a pas encore
eu lieu.

## Deux artifacts, pour ne pas payer deux fois

Le rapport Allure généré à chaque run contient déjà tout l'historique de la PR, fusionné dans son
dossier `history/`. Mais publier ce rapport complet comme unique artifact aurait forcé un choix
absurde : payer 90 jours de stockage sur des captures d'écran d'échec pour garder la continuité
d'historique sur une PR longue, ou perdre cette continuité pour ne pas payer.

Le dépôt sépare donc deux artifacts, à rétention différente :

- `allure-report-<slug>-run<n>` — le rapport HTML complet, 14 jours de rétention. Ce qu'un humain
  consulte ; peu d'intérêt à le garder plus longtemps.
- `allure-history-<slug>` — uniquement le fichier d'historique (`.allure/history.jsonl`, quelques
  Ko), 90 jours. Ce que le pipeline restaure au run suivant, pour que la courbe de tendance ne
  reparte pas de zéro à chaque push.

L'isolation entre PR ne repose ni sur le nom de branche ni sur le dépôt appelant seul, mais sur un
`slug` combinant les deux — un nom de branche pouvant se répéter entre dépôts frères. Et comme les
résultats des trois plateformes peuvent un jour se retrouver dans un même rapport fusionné,
`wdio.base.conf.ts` pose un label **et** un paramètre `platform` sur chaque test — sans le
paramètre, deux tests homonymes sur deux plateformes différentes se feraient passer l'un pour
l'autre dans l'historique Allure, dont l'identité (`historyId`) se calcule sur les paramètres du
test, pas sur ses labels.

## Ce qu'on ne sait pas encore

Une dernière habitude de cette CI mérite d'être citée pour ce qu'elle est : une honnêteté rare dans
une documentation technique. L'ADR se termine par une section qui liste ce qui n'a **jamais** été
vérifié sur un run GitHub réel au moment de la décision — le comportement du téléchargement
d'artifact quand aucun ne correspond au motif recherché, ou le flux complet de commentaire cross-
dépôt, qu'aucun outil de simulation locale ne peut reproduire fidèlement.

Dire ce qu'on ne sait pas encore n'est pas une faiblesse à cacher. C'est exactement la même
discipline que celle qui gouverne les tests eux-mêmes : ne jamais affirmer qu'un chemin est prouvé
sans l'avoir vu passer, une fois, pour de vrai.

---

*Fin de cette série de cinq articles. Elle part d'un mur — prouver qu'une stack entière tient
ensemble — et finit sur une CI qui refuse de mentir sur ce qu'elle a vérifié. Entre les deux : un
outil choisi pour sa franchise plutôt que pour sa rapidité d'écriture, un corpus unique décliné sur
trois runtimes, et un terrain — la WebView, l'OIDC — qui n'a jamais laissé deviner ses pièges à
l'avance.*