---
title: Pourquoi des tests système, sur AMI
date: 2026-09-01
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 1
statut: brouillon
sources:
  - docs/adr/2026-06-04-Outils-tests-E2E.md
  - docs/presentation/slides-equipe.typ
  - src/tests/mobile/demarches.test.ts
---

# Pourquoi des tests système, sur AMI

## Tout commence avec des tests

Nous avons un premier constat, où les outils de tests unitaire nous permettent de lancer le code métier (des règles de gestion à l'intérieur de l'application) qu'on développe avec les conditions de départ que l'on veut plus rapidement que n'importe quel test manuel.
Finalement, c'est utile dès que l'on trouve qu'un code est "important" et ça documente le code et sa dynamique, là où la documentations et les signatures d'API (swagger) sont statiques.
C'est utile pour le mettre au point et pour documenter, bien sûr, mais aussi plus tard quand on devra le faire évoluer ou l'intégrer, le combiner avec d'autres fonctionnalités souvent inconnues au moment de premier développement.
Nous avons aussi fait quelques tests d'intégration pour montrer que les use cases avec transactions se passent bien, que les différentes parties du backend fonctionnent bien ensemble.

Nous avons été très satisfaits de ces tests automatisés qui attrapent les régressions qui prouvent le bon fonctionnement des fonctionnalités quand on les combine.
Elles sont d'ailleurs bloquantes dans la CI.

## Le mur des app mobiles

Et puis nous avons buté sur une difficulté que ni l'un ni l'autre ne couvrait : tester les
applications mobiles, leurs échanges avec les webapps, et leur communication avec le back.
Pour prouver que notre stack tenait *en entier*, il fallait un test capable de faire
tenir ensemble, dans un même scénario, une base de données, un back, des webapps et une application
mobile Android réelle. 
Rien de ce qu'on avait déjà écrit ne pouvait simuler tout ça à la fois.

C'est ce mur qui a fait naître les tests système : la nécessité de prouver que quelques chemins
critiques savaient s'intégrer à travers toute la pile applicative d'AMI, pas seulement à travers
une de ses couches.

Au passage, il y a des tests de recette manuels qui sont pénibles à faire, en plus d'être chronophages.
Nous avons choisi d'investir du temps pour en automatiser autant que possible.

> L'ADR fondatrice du choix d'outil le formule ainsi :
> *« Les fonctionnalités s'ajoutent, le temps de recette reste constant. […] La bonne intégration
> des use cases entre-eux et la maîtrise du déploiement de chaque correctif sur la web app, sur ios
> et sur android reste un challenge. »*

## L'instant maître Capello

D'après l'expérience de certains:
Quand les développeurs parlent de tests end to end, ils parlent de tests d'une ou peu d'étapes utilisateurs qui traversent toutes les technologies mises en œuvre dans l'application: de l'UI au stockage.
Quand les testeurs parlent de tests end to end, ils parlent de tests d'un scénario utilisateurs du login jusqu'à la fin du parcours utilisateur; le suivi de la commande, la prise en compte d'une démarche, etc.
Quand les testeurs parlent de tests systèmes ils parlent de tests prouvant que le système déployé fonctionne.

## Ce qu'on demande à un test système

Il y a les bons tests systèmes et les mauvais tests systèmes.
Les bons tests vérifient des choses qui n'ont pas été vérifiées avant.
Les tests unitaires ont vérifié les règles de gestion.
Les tests d'intégration ont vérifié les use cases et leurs transactions.
Les tests systèmes doivent vérifier:
- l'enchainement des use cases: des workflows utilisateurs, leurs parcours essentiels
- l'intégration des logiciels dans leur infrastructure.

Ce deuxième point, autrement dit, doit tester le bon déploiement sur un environnement, que la configuration est la bonne.
Les deux points ensemble prouvent que les composants déployés sur l'environnement testé peuvent être mis entre les mains d'humains sans qu'ils perdent leur temps, qu'ils soient testeurs, produits ou utilisateurs.

## Les limites des tests systèmes

Comme ils engagent beaucoup de systèmes, ils engagent beaucoup de code, de données et de raisons d'échouer.
Il y a deux limites à ces tests.

1. Pas de tests fonctionnels à cette hauteur dans la pyramide
Comme les tests précédents ont testé les cas aux bornes, les tests systèmes utilisent des cas nominaux pour traverser tous les systèmes et tout le code pour montrer que les données écrites peuvent être relues et que les logiciels communiquent bien entre eux.
Donc, première limite, on ne teste pas les fonctionnalités et leurs détails dans ces tests systèmes.
C'est ce critère essentiel qui leur permet d'être stable d'une version à l'autre.

2. Le coût/bénéfice avant l'exhaustivité
Ces tests sont cher en mise au point (beaucoup de données, beaucoup de code changeant, beaucoup d'asynchrone) et cher en exécution (déploiement, scénario longs).
Il faut donc limiter leur nombre aux scénarios de plus grande valeur.

### Smoke tests

Le déploiement est bien configuré, tous les systèmes se parlent entre eux.
Un scénario s'authentifie via le flow FranceConnect complet et vérifie seulement l'arrivée sur la
page d'accueil, sans valider aucune règle métier.

### Chemin critique

Le parcours utilisateur qui est la raison d'être de l'application : un achat pour un site de
e-commerce, une démarche démarrée et suivie pour nous.
Un scénario crée une démarche partenaire via l'API, la fait évoluer puis la clôture, et vérifie à
chaque étape qu'elle apparaît correctement dans le suivi de l'usager.

### Fonctions essentielles non testables plus bas dans la pyramide

Ce que seul un scénario bout en bout peut prouver : la communication entre l'app mobile et la
webview, ou le process d'authentification complet.
Un scénario publie une notification côté partenaire alors que la permission push du système a été
refusée, et vérifie qu'elle apparaît malgré tout dans l'inbox in-app.

### En bonus : des scénarios pénibles à rejouer à la main

Certains cas ne relèvent pas d'une fonctionnalité précise mais d'une hygiène de non-régression
qu'on préférerait ne plus jamais faire à la main : se connecter, utiliser les fonctionnalités
d'écriture et de stockage de données, se déconnecter, se reconnecter avec un autre compte, puis
vérifier qu'aucune donnée du compte précédent n'y est visible.
C'est encore une direction plus qu'un scénario figé, mais c'est celle qui serait complète.

## Finalement, c'est quoi la strat ?

Concrètement, un test système AMI a trois missions, et une limite volontaire :

- **rejouer les anciens scénarios** contre le risque de régression, à chaque évolution ;
- **couvrir les cas nominaux**, les chemins qu'un usager emprunte réellement, pas toutes les
  branches possibles ;
- **ne pas** revalider les règles de gestion : ce travail-là appartient aux tests unitaires, qui le
  font plus vite et plus finement.

Le critère de réussite n'est donc pas « zéro test rouge en permanence ».
C'est : **quand les tests sont verts, c'est garanti que la personne qui fait la recette ne perdra pas son temps sur des acquis**
Elle peut se concentrer sur ce qui est nouveau dans la version à valider.

