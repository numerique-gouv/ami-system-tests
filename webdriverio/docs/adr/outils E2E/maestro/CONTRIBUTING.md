## Contribuer aux tests Maestro E2E

### Pré-requis

Copier `.env.example` en `.env` et remplir les variables :

```sh
cp maestro/.env.example maestro/.env
```

| Variable | Description | Où récupérer |
|---|---|---|
| `NOTIF_API_URL` | URL du backend AMI sans slash final | `https://ami-back-staging.osc-fr1.scalingo.io` (staging) |
| `NOTIF_PARTNER_ID` | ID du partner | `dinum-ami` |
| `NOTIF_PARTNER_SECRET` | Secret BasicAuth partenaire | [Dashboard Scalingo `ami-back-staging`](https://dashboard.scalingo.com/apps/osc-fr1/ami-back-staging/environment) → `PARTNERS_DINUM_AMI_SECRET` |
| `NOTIF_RECIPIENT_FC_HASH` | SHA256 des données pivot FC du user `test/123` | Hardcodé dans `.env.example` (déterministe) |

> `.env` est gitignore — ne jamais committer les secrets.

### Lancer les tests

```sh
just test-android                   # tous les flows Android non-wip
just test-android smoke             # tag smoke uniquement
just test-android notifications     # scénario notifications E2E
just test-android wip               # flows WIP Android (pour itérer sur les TODOs)
just test-ios notifications         # idem iOS
just test notifications             # Android + iOS
```

Les tags disponibles sont déclarés dans le frontmatter de chaque flow (`tags: [...]`).
Les flows taggés `wip` sont exclus par défaut (via `config.yaml`) — les passer explicitement pour les faire tourner.

### Pré-requis iOS — reset de la permission notifications

Si le simulateur a déjà une décision mémorisée (accordée ou refusée), la sheet d'onboarding notifications ne s'affiche pas entre les runs. Réinitialiser avant un run notifications :

```sh
xcrun simctl privacy <device_id> reset notifications fr.gouv.ami.staging
```

### Publier une notification manuellement

Les notifications sont publiées via l'API partenaire `POST /api/v1/notifications` (BasicAuth).
Voir : https://docs.maestro.dev/maestro-flows/javascript/make-http-requests

Le script Maestro `scripts/notification-publish.js` encapsule cet appel.

> ⚠️ Idempotence : le backend retourne `200 OK` (sans push) si le payload est exactement identique.
> Le script génère `send_date: new Date().toISOString()` pour garantir l'unicité à chaque appel.
> Les notifications envoyées pendant les tests restent en DB sur staging — c'est attendu.

### relancer un test sur un device déjà lancé: résolu:

La commande `maestro test --reinstall-driver` ne peut pas bootstrapper depuis zéro — il nécessite une connexion gRPC déjà active pour pouvoir réinstaller. Le bootstrap manuel (unzip → install → forward → instrument) reste la seule solution fiable avec Maestro 2.5.1.
La cible `_driver-start:` dans le justfile est moche ET nécessaire.

