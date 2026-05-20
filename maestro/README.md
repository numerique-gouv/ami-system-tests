

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

## Maestro n'a que sa propre ferme d'appareils mobile (vendor locké): solvable
- Pour SauceLabs et le marché des fermes d'appareils: Maestro runner est une implémentation OSS de Maestro [compatible TestingBot et SauceLabs](https://github.com/devicelab-dev/maestro-runner)
- [TestingBot reçoit du Maestro nativement](https://fr.testingbot.com/features/automation/maestro)


