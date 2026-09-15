---
title: Choisir son outil de tests E2E
date: 2026-09-15
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 2
statut: brouillon
sources:
  - docs/adr/2026-06-04-Outils-tests-E2E.md
  - docs/adr/outils E2E/playwright/README.md
  - docs/adr/outils E2E/maestro/README.md
  - docs/adr/outils E2E/maestro/CONTRIBUTING.md
  - docs/adr/outils E2E/maestro/guidelines/textVisibleButNotFound.md
  - docs/adr/outils E2E/maestro/guidelines/inputNonAsciiFails.md
  - docs/adr/outils E2E/maestro/guidelines/port_tcp_701_closed.md
  - docs/adr/outils E2E/Maestro_vs_WDIO.md
  - docs/presentation/assets/maestro-vanilla.yaml
  - docs/presentation/assets/wdio-page.ts
  - docs/presentation/assets/wdio-test.ts
---

# Choisir son outil de tests E2E

## Ce qu'on refusait de tester à la main

Le point de départ, c'est un problème d'organisation : les fonctionnalités s'ajoutent au fil des
versions, et le temps disponible pour la recette manuelle reste constant. Et cette recette doit couvrir la bonne intégration de tous les usages entre
eux, ainsi que le bon déploiement de chaque correctif sur la webapp, sur iOS et sur Android — ce
qui reste, en soi, un vrai défi.

Pour ne pas choisir un outil sur des critères marketing, nous avons d'abord listé cinq situations
qu'on savait pénibles à rejouer à la main, et qui font apparaître les faiblesses d'un outil dès
qu'on triche sur leur couverture :

- les **notifications push** — un pop-up du système, en dehors de notre propre application ;
- les **scénarios à deux acteurs** — un partenaire publie une notification, un usager la consulte ;
- le **multi-appareils** — un usager connecté sur deux téléphones, une déconnexion sur l'un affecte
  l'autre ;
- la **reconnexion sur une démarche partenaire externe** en restant authentifié ;
- les **premières connexions**, qu'il faut pouvoir rejouer à chaque relance de la suite de tests.

Ce n'est qu'ensuite que nous avons comparé les candidats — pas en lisant leur documentation, mais
en essayant d'écrire ces cinq situations avec chacun d'eux.

## Playwright, écarté rapidement

Playwright est le premier nom qui vient à l'esprit pour tester une application web. Le problème,
c'est qu'il ne sait pas nativement piloter des applications mobiles : il faut lui adjoindre un
complément, et nous en avons regardé quatre.

L'option la plus proche de Playwright ne couvre que les vues web affichées dans une application
Android — rien côté iOS, rien pour les écrans natifs. Une autre, la plus documentée pour ce genre
d'usage, n'est plus maintenue depuis fin 2024. Une troisième, très récente et prometteuse, venait
tout juste de démarrer au moment de notre évaluation — trop jeune pour qu'on lui fasse confiance
tout de suite, mais assez intéressante pour qu'on garde un œil dessus : si le projet devait
recommencer dans deux ans, ce serait le premier candidat à réévaluer. La dernière option consiste à
superposer deux outils différents — plus de complexité, pour un bénéfice qui ne concernait que le
confort d'écriture des tests.

Aucune de ces quatre pistes n'était, à ce moment-là, en état de couvrir nos cinq situations. Nous
avons laissé Playwright de côté.

## Maestro, essayé pour de vrai

Restait Maestro, un outil pensé spécifiquement pour tester des applications mobiles, en décrivant
les parcours plutôt qu'en les programmant. Nous ne nous sommes pas arrêtés à sa présentation :
nous avons construit un prototype fonctionnel, avec de vrais scénarios qui se lançaient sur nos
applications, des identifiants de test dédiés, et un petit script pour déclencher l'envoi d'une
notification depuis le côté partenaire. Ce prototype n'a pas été conservé une fois la décision
prise — il a permis de se faire une opinion en l'ayant vu tourner.

Ce qui séduit tout de suite, c'est que décrire un scénario avec Maestro ressemble à écrire une
checklist de recette manuelle. Voici, par exemple, à quoi ressemble le test de la notification
in-app : on lance l'application, on se connecte, on passe l'écran d'accueil, on attend que le
contenu de l'application se charge, on ouvre la boîte de notifications, puis on en déclenche une
depuis le côté partenaire.

```yaml
# docs/presentation/assets/maestro-vanilla.yaml
- runFlow: ../../subflows/_launch.yaml
- runFlow: ../../subflows/auth/login.yaml
- runFlow: ../../subflows/onboarding/dismiss.yaml
- runFlow: ../../subflows/webview/wait-loaded.yaml
- runFlow: ../../subflows/notifications/open-inbox.yaml
- runFlow:
    file: ../../subflows/notifications/publish.yaml
    env:
      NOTIF_TITLE: ${output.notif_name}
```

Chaque ligne se lit presque comme une phrase, sans qu'il soit nécessaire de savoir programmer.

## Les difficultés rencontrées en pratiquant

C'est en faisant tourner ce prototype, pas en lisant la documentation, que trois difficultés sont
apparues.

La première touche au cœur même de ce que nous testons : l'application affiche son contenu dans
une vue web intégrée à l'application mobile, et cette vue met du temps à « se révéler » aux outils
d'automatisation — un texte peut être visible à l'écran sans que l'outil parvienne à le détecter.
Une solution existe côté Android, mais aucune solution équivalente n'existe côté iOS : il faut
alors ruser, en simulant un appui sur un endroit neutre de l'écran pour réveiller cette
détection. Pour une application dont l'essentiel du contenu passe justement par ce type de vue,
sur les deux plateformes, cela touche l'essentiel de ce que nous testons.

La deuxième concerne la saisie de texte contenant des accents ou des caractères spéciaux. Elle
fonctionne normalement sur iOS, mais échoue systématiquement sur Android à cause d'une limite
connue et ancienne de l'outil système utilisé pour simuler la frappe au clavier — un problème que
ni l'éditeur de l'outil de test, ni Google, n'ont corrigé à ce jour. Sur une application publique
française, où les champs de saisie contiennent couramment des accents, cela pose un vrai souci.

La troisième est plus une question d'exploitation quotidienne : à plusieurs reprises, relancer les
tests s'est heurté à un port réseau resté occupé par une exécution précédente mal terminée, ce qui
a demandé de mettre en place une petite procédure de nettoyage avant chaque lancement.

## Ce qui a vraiment pesé dans la décision

Ces trois difficultés n'ont pas été, à elles seules, ce qui a fait pencher la balance — la
première et la troisième restent contournables, et on peut vivre avec. Un constat plus
structurel a davantage compté : il touche directement nos cinq situations de départ.

La description d'un scénario avec Maestro est simple tant qu'on reste dans un cas standard. Mais
nos parcours ont des variantes — une connexion via France Connect qui peut se dérouler de façon
complète ou raccourcie, un écran d'authentification qui peut réapparaître à cause d'un incident
technique côté fournisseur d'identité — et exprimer ces variantes a demandé de tordre l'écriture
des scénarios au-delà de ce que le format prévoyait. Un mécanisme d'échappatoire existe pour
écrire de la logique plus fine, mais il tourne dans un environnement très restreint, sans accès
aux bibliothèques ni aux outils habituels — un contournement documenté consiste même à faire
appel, depuis ce mécanisme, à un petit service annexe écrit à part. Ça fonctionne, mais on
s'éloigne largement de la simplicité initiale.

La couverture de la webapp elle-même n'a pas vraiment été creusée à ce stade : on ne l'a pas
sérieusement testée avec Maestro, qui propose pourtant un mode navigateur (encore en bêta à
l'époque). Ce point n'a donc pas pesé dans la décision — ce serait malhonnête de le présenter
après coup comme un argument.

## WebdriverIO, et son prix

Il restait WebdriverIO, un outil plus ancien, moins immédiat à prendre en main, mais capable de
piloter aussi bien la webapp que les applications Android et iOS, avec un seul langage de
programmation partagé entre les trois. Écrire un scénario y demande davantage de lignes qu'avec
Maestro — voici le même test de notification, réécrit avec WebdriverIO :

```typescript
// docs/presentation/assets/wdio-test.ts
it("reçoit une notification dans l'inbox in-app", async () => {
    await NotificationsInboxPage.openFromHome()
    const oldTop = await NotificationsInboxPage.getTopNotificationTitle()

    const title = `AMI-vanilla-${Date.now()}`
    await publishNotification({ title, body: "push non autorisé" })

    await NotificationsInboxPage.pullToRefresh()
    await NotificationsInboxPage.waitForNotification(title)
    expect(oldTop).not.toEqual(title)
})
```

C'est plus long à écrire, mais on peut y exprimer ce dont on a besoin, puisque c'est du code
plutôt qu'une description figée — et une seule stack couvre les trois cibles, avec le même
langage partout.

Ce choix a un prix. Comparé à Maestro, WebdriverIO demande un temps de mise en place plus long,
une gestion plus explicite des temps d'attente entre chaque action, et il est réputé plus sujet
aux tests qui échouent de façon intermittente sans raison métier. En échange, on garde un contrôle
plus fin sur ce qui se passe entre l'application native et son contenu web, une vraie capacité à
structurer le code de test, et la possibilité de faire tourner les tests en parallèle.

Nous n'avons donc pas fait ce choix en pensant qu'il réglait tout. Nous savions, en le faisant,
qu'il faudrait enrichir le projet d'outils et de méthodes partagées pour que programmer un
scénario reste aussi accessible à lire qu'une checklist. C'est le sujet du prochain article : les
habitudes qu'on a dû construire pour qu'un seul jeu de scénarios s'exécute sur la webapp, Android
et iOS, sans être réécrit trois fois.

---

*Prochain article : comment un seul corpus de scénarios s'exécute sur trois runtimes — webapp,
Android, iOS — sans dupliquer le code.*