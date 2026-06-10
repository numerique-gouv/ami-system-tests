# Outils de tests End to End (E2E)

## Problème
Les fonctionnalités s'ajoutent, le temps de recette reste constant.
Nous devons déléguer les tests de recette d'hier a un outil de tests automatisés pour se prémunir contre des régressions.
Les règles de gestions et les use-case se développent sans douleurs aujourd'hui.
La bonne intégrations des use cases entre-eux et la maitrise du déploiement de chaque correctif sur la webb app, sur ios et sur android reste un challenge.

## Décision
Nous commençons les tests de parcours avec webdriverio (WDIO) car il est mature et sans abstractions limitantes.

## Statut

# Détails
Trois familles de solutions ont été envisagées:
- Playwright, le plus connus des dev web
- Maestro, l'outsider productif
- WebDriverIO, le dinosaure du test mobile

## Postulats
Les points difficiles à testser:
- les notifications push (pop-up système en dehors de notre app)
- les interactions multi-utilisateurs (partenaire émet une notification, l'usager la consulte)
- les interactions multi-appareils (usager se loggue sur deux appareils, le plus récent reçoit une notification, il se déconnecte du plus récent, ...)
- l'usager se reconnecte sur une démarche partenaire externe en étant authentifié.
- les premières connexions (les premières fois quand on relance les tests, ...)

## Options
[Pour playwright, l'outil est ses variantes ne sont pas satisfaisants](outils%20E2E/playwright/README.md).
Il reste un point de vigilance sur [mobilewright qui est un nouvel entrant (mars 2026) prometteur](https://github.com/mobile-next/mobilewright).
Il pourrait être le prochain meilleur choix.

[Pour Maestro, sa productivité vient de son écriture de scénario de manière déclarative (en yaml).](outils%20E2E/maestro/README.md)
La description est plus rapide que la programmation.
La description limite la capacité d'expression des scénarios à ce qui a été abstrait par l'outil.
Les parcours variables (FCnx - France Connection - complète ou directe, la mire FC qui revient a cause d'un bug OIDC, ...) nous forcent à tordre l'écriture des scénarios pour qu'ils soient exprimables en yaml.
Dernier point Maestro ne teste que les mobiles, donc la non-régression de l'interface d'adminisatrion devrait se faire sur un chrome sous android ou un safari sous ios ?

Reste WDIO, qui permet d'aller au bout, mais en programmant les scenarios en TS (typescript).
Le projet devra s'enrichir de helpers et méthodes pour pouvoir faciliter la progression des dev dans l'écriture des scénarios.

## Notes
