Le port gRPC 7001 est inaccessible — le driver Maestro n'est pas prêt.
Cause fréquente : Maestro Studio est ouvert et occupe déjà le port.
Voir : https://github.com/mobile-dev-inc/maestro/issues/3065

Cause probable, un process maestro tourne toujours, même après fermeture :
```shell
ps x | grep -i maestro | grep -v grep
```
