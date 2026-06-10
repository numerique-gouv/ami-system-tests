

# limitations de Maestro

## le yaml simplifie mais ne permet pas les corner case: résolu
Les tests sont écris en YAML, donc une abstraction qui n'expose pas tous les détails de pages web, natives ios ou android.
Cela fait des tests simples dans le cas général.
Cette abstraction permet d'exécuter du code js par plusieurs balise dont "runScript" :
```yaml
- runScript:
  file: ../../scripts/notification-publish.js
  env:
  NOTIF_TITLE: ${NOTIF_TITLE}
  NOTIF_BODY: ${NOTIF_BODY}
  NOTIF_API_URL: ${NOTIF_API_URL}
```

Ce JS tourne dans une machine virtuelle JS (GraalJS) et pas dans Node, elle n'a accès qu'a un client rest, elle ne peut pas créer de process système ou inclure de livrairie tierce.?

Le contournement ultime étant de créer un serveur rest en node qui implémente le controunement et le script maestro le déclenche en appelant l'api rest de notre contournement. L'IA pouvant facilement générer une API REST qui exécute une procédure.

## Maestro n'a que sa propre ferme d'appareils mobile (vendor locké): solvable
- Pour SauceLabs et le marché des fermes d'appareils: Maestro runner est une implémentation OSS de Maestro [compatible TestingBot et SauceLabs](https://github.com/devicelab-dev/maestro-runner)
- [TestingBot reçoit du Maestro nativement](https://fr.testingbot.com/features/automation/maestro)

## Maestro a aussi des contraintes de dev: solved

ces contraintes sont décrites dans les [guidelines de dev Maestro](./guidelines)
