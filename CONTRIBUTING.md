
Les envois de notification passent toujours par le Firebase de google pour Android, ca pourrait passer pour les appareils virtuels selon google, si il a le google play services.
Mais pour IPhone, ca passe pas, toujours selon internet.

Pour envoyer une notification push:
Sur l'url de ton environnement:
https://ami-back-staging.osc-fr1.scalingo.io/schema/rapidoc#post-/api/v1/notifications
POST /api/v1/notifications
En haut à droite: l'auth est nécéssaire:
comptes sont dans le projet ami-notificaiton-api:ami/partner/models.py
Les SECRETS sont dans les environnements scalingo.

Le fc_hash est l'identifiant de l'utilisateur :
Le "fc hash" tu peux l'avoir en te connectant sur l'app web, et aller dans la partie "nous contacter" du menu déroulant en haut à gauche.

un payload exemple:
```json
{
"recipient_fc_hash": "4abd71ec1f581dce2ea2221cbeac7c973c6aea7bcb835acdfe7d6494f1528060",
"content_title": "un titre",
"content_body": "un contenu",
"item_id": "123",
"item_type": "new",
"item_status_label": "un label",
"item_generic_status": "new",
"send_date": "2026-05-19T00:00:00.000Z",
"try_push": true
}
```
