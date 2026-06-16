# Mapping statique back AMI — routes → handlers

Produit par lecture directe du code source (`ami-notifications-api/`).  
Outil : grep sur `urls.py` + `api_urls.py`, lecture des `api_views.py`.  
**Aucune inférence** : toutes les cases sont issues du code ou notées `n/a`.

---

## Racine du routage

```
ami/urls.py          — include(authentication_urls)
ami/api/urls.py      — préfixe api/v1/ ; inclut :
                         authentication_api_urls
                         fi_api_urls           → api/v1/fi/
                         notification_api_urls  → api/v1/ (+ root_urlpatterns sans préfixe)
                         partner_api_urls       → api/v1/
```

---

## Routes observées dans le parcours FCD

| Méthode | Chemin URL | Fichier route | Ligne route | Handler | Fichier handler | Ligne handler | `logger.*` dans le handler |
|---------|-----------|---------------|-------------|---------|-----------------|---------------|---------------------------|
| GET | `api/v1/users/notifications` | `ami/notification/api_urls.py` | 12 | `list_notifications` | `ami/notification/api_views.py` | 37 | aucun |
| PATCH | `api/v1/users/notification/<uuid>/read` | `ami/notification/api_urls.py` | 13 | `read_notification` | `ami/notification/api_views.py` | 52 | aucun |
| GET | `api/v1/partner/otv/url` | `ami/partner/api_urls.py` | 9 | `generate_partner_url` | `ami/partner/api_views.py` | 21 | aucun |

---

## Chaîne d'appel interne pour `generate_partner_url`

```
partner/api_views.py:21  generate_partner_url()
  └─ ami/utils/__init__.py:66  generate_identity_token()
       ├─ ami/utils/__init__.py:19  encrypt_data()   ← chiffre les données RSA-OAEP
       └─ ami/utils/__init__.py:61  sign_identity_token()
            └─ ami/utils/__init__.py:49  get_partners_psl_otv_jwt_private_key()  ← lit settings.PARTNERS_PSL_OTV_JWT_CERT_PFX_B64
```

`logger.*` présents dans toute la chaîne : **aucun**.  
Le seul signal de log disponible côté Scalingo pour cet appel est la ligne access-log du router (méthode, chemin, statut, durée).

---

## Route non utilisée dans le parcours FCD

| Chemin | Handler | Note |
|--------|---------|------|
| `api/v1/partner/otv/public_key` | `get_partner_public_key` | Pas observé dans la capture réseau |
| `api/v1/fi/*` | module `ami.fi` | Non utilisé dans le parcours OTV |

---

## Notes sur les logs Scalingo

Scalingo Django émet en général :
- Une ligne router : `method path status duration host=… fwd=…`
- Des lignes applicatives Django si `LOGGING` est configuré avec `console` handler

Aucun `logger.*` n'est présent dans les handlers observés. Les logs attendus dans `scalingo-logs.txt` seront donc **uniquement les access-logs Scalingo Router**, identifiables par `X-Request-ID`.

Si des logs applicatifs apparaissent (ex. Sentry breadcrumbs, erreurs Django), ils seront correlés via le même `X-Request-ID`.
