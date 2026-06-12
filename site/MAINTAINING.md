# Maintenance du template eleventy-dsfr

Le dossier `site/` est intégré via `git subtree` depuis
[codegouvfr/eleventy-dsfr](https://github.com/codegouvfr/eleventy-dsfr).

## Mettre à jour le template upstream

```bash
# Depuis la racine du repo parent
git fetch docs-upstream
git subtree pull --prefix=site docs-upstream main --squash
```

En cas de conflit (fichiers modifiés des deux côtés) :
1. Résoudre les conflits dans les fichiers indiqués par git
2. `git add` les fichiers résolus
3. `git commit` (le message de merge est pré-rempli)

## Fichiers personnalisés (à surveiller lors d'un merge)

| Fichier | Modification |
|---|---|
| `eleventy.config.js` | `pathPrefix` via env var, shortcode `codefile`, fence Mermaid, container RapiDoc |
| `markdown-custom-containers.js` | Container `rapidoc` ajouté |
| `_includes/layouts/base.njk` | Scripts Mermaid (CDN jsDelivr) et RapiDoc (CDN unpkg) injectés avant `</body>` |
| `MAINTAINING.md` | Ce fichier |

## Re-ajouter le remote si cloné depuis zéro

```bash
git remote add docs-upstream https://github.com/codegouvfr/eleventy-dsfr.git
```
