---
title: Choisir son outil de tests E2E
date: 2026-09-01
author: Nicolas Fedou
serie: Tests système E2E sur AMI
ordre: 2
statut: brouillon
sources:
  - docs/adr/2026-06-04-Outils-tests-E2E.md
  - docs/adr/outils E2E/Maestro_vs_WDIO.md
  - docs/adr/outils E2E/maestro/README.md
  - docs/presentation/assets/maestro-vanilla.yaml
  - docs/presentation/assets/wdio-page.ts
  - docs/presentation/assets/wdio-test.ts
---

# Choisir son outil de tests E2E

## Un critère pour trancher

Tous les candidats savaient piloter une application, mobile ou web. La vraie question, sur un
projet qui vit plusieurs années, portait ailleurs : combien de code faudrait-il maintenir quand
l'application évoluerait ?

Nous avons confronté chaque candidat aux cas les plus difficiles à tester sur AMI :

- les **notifications push** — un pop-up système, en dehors de notre propre app ;
- les **scénarios à deux acteurs** — un partenaire publie une notification, un usager la consulte ;
- le **multi-appareils** — un usager connecté sur deux téléphones, une déconnexion sur l'un affecte
  l'autre ;
- la **reconnexion sur une démarche partenaire externe** en restant authentifié ;
- les **premières connexions**, à chaque relance de la suite de tests.

## Les candidats côté web

Pour piloter des applications web, la première option qui vient à l'esprit est Playwright, le plus
connu des développeurs web. Playwright n'a cependant pas de pilotage natif du mobile ; il faut
passer par une variante. Nous en avons évalué trois : l'API Android de Playwright elle-même
(expérimentale, ne couvre que les WebViews Android — ni iOS, ni éléments natifs), Appwright (gelé
depuis fin 2024), et Mobilewright, le nouvel entrant le plus intéressant.

Mobilewright a un défaut simple : au moment de l'évaluation, il en était à ses tout premiers
commits, en mars 2026. Trop récent pour être considéré stable, mais suffisamment prometteur pour
rester noté comme point de vigilance : si le projet devait recommencer dans deux ans, Mobilewright
serait le premier candidat à réévaluer.

## Les candidats côté mobile natif

Restaient deux familles pour piloter du mobile : les frameworks natifs de chaque plateforme, et un
outil dédié au test mobile, Maestro.

Sa productivité vient de son écriture déclarative, en YAML. Décrire un scénario y va plus vite que
le programmer. Un scénario Maestro se lit presque comme une checklist :

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

Cette même déclaration limite la capacité d'expression des scénarios à ce que l'outil a bien voulu
abstraire. Les parcours variables — une connexion via France Connect complète ou raccourcie, un
écran d'authentification qui revient à cause d'un incident côté fournisseur d'identité — nous ont
forcés à tordre l'écriture des scénarios pour qu'ils restent exprimables en YAML. Une échappatoire
existe, une balise qui exécute du JavaScript, mais dans un environnement très restreint : pas de
bibliothèque tierce, pas de process système. Le contournement documenté consiste à écrire un petit
serveur à côté, que le scénario Maestro appelle en HTTP — ce qui fonctionne, mais s'éloigne
largement du déclaratif.

La couverture de la webapp elle-même n'a pas vraiment été creusée à ce stade — on ne l'a pas
sérieusement testée avec Maestro, qui propose pourtant un mode navigateur (encore en bêta à
l'époque). Ce point n'a donc pas pesé dans le choix.

## Le choix, et son coût assumé

Restait WebdriverIO, mature, sans abstraction qui limite ce qu'on peut exprimer, et capable de
piloter les trois cibles (webapp, Android, iOS) avec un seul langage : TypeScript.

Voici le même scénario que le YAML Maestro ci-dessus, mais en WebdriverIO — un Page Object, puis
le test qui l'utilise :

```typescript
// docs/presentation/assets/wdio-page.ts
class NotificationsInboxPage {
  async waitForNotification(title: string): Promise<void> {
    await withWebView(async () => {
      await tl().findByText(title, {}, { timeout: 20000 })
    })
  }
}
```

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

Écrire ce scénario demande davantage de lignes que le YAML. En échange, on peut y exprimer ce dont
on a besoin, puisque c'est du code. Ce choix a un coût : le projet doit s'enrichir de helpers et
de méthodes partagées pour que la progression des développeurs dans l'écriture des scénarios reste
facile.

C'est le sujet du prochain article : les patterns qu'on a dû construire pour que programmer un
scénario reste aussi simple à lire qu'une checklist.

---

*Prochain article : comment un seul corpus de scénarios s'exécute sur trois runtimes — webapp,
Android, iOS — sans dupliquer le code.*