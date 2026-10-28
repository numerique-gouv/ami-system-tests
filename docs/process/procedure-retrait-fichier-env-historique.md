# Procédure : retirer `.env.local.staging` de l'historique git

**Statut : écrite le 2026-10-27, NON exécutée.** La décision de réécrire l'historique et de forcer la poussée appartient à l'utilisateur.
Ce document ne contient aucune valeur secrète.

## Constat (vérifié)

- Le fichier `.env.local.staging` a été ajouté à l'index par le commit `2461882` (« fix(webapp): profil Chrome conservé d'une spec à l'autre
  en mode visible »), avec des valeurs renseignées, notamment le secret du partenaire AMI (`NOTIF_PARTNER_SECRET`) et la clé d'accès de la
  webapp de staging (`WEB_APP_ACCESS_KEYS`).
- Ce commit est présent sur `origin/77-migre-vers-wdio-10` ; il est absent de `origin/main`.
- Le commit `dd419a8` a retiré le fichier de l'index et ajouté `.env.local*` au `.gitignore` : **le fichier n'est plus suivi, mais il
  reste dans l'historique**, donc dans tout clone, fork, cache ou référence de PR qui contient `2461882`.

## 1. Rotation des secrets (à faire dans tous les cas, avant ou après la réécriture)

La réécriture de l'historique ne suffit pas : les valeurs ont pu être clonées, mises en cache (GitHub, CI, postes) ou copiées. Considérer les
deux secrets comme compromis :

1. **Secret du partenaire AMI** : variable `PARTNERS_DINUM_AMI_SECRET` de l'application Scalingo du backend (staging, puis tout environnement où
   la même valeur serait utilisée). Redéployer le backend, puis mettre à jour `NOTIF_PARTNER_SECRET` dans les `.env.local*` des postes et
   dans les secrets GitHub des dépôts appelants (`secrets: inherit`).
2. **Clé d'accès de la webapp de staging** : la valeur (ou la liste) configurée côté backend pour le code d'accès de la SPA ; mettre à jour
   `WEB_APP_ACCESS_KEYS` dans les `.env.local*` et dans les secrets GitHub.
3. Vérifier, sans afficher de valeur, qu'aucun autre secret n'a été commité (voir l'étape 5).

## 2. Préparation

1. Prévenir toute personne qui a cloné le dépôt ou qui travaille sur une branche issue de `77-migre-vers-wdio-10` : elles devront re-cloner
   ou rebaser (étape 6).
2. Faire un **clone miroir de sauvegarde**, hors du dépôt de travail : `git clone --mirror <url> sauvegarde-avant-reecriture.git`.
3. Travailler dans un **clone neuf** (jamais dans le dépôt de travail ni dans un worktree existant) : `git filter-repo` refuse de tourner
   sur un clone qui n'est pas « frais » et il réécrit toutes les références.
4. Installer `git filter-repo` (`brew install git-filter-repo`).

## 3. Réécriture (dans le clone neuf)

```bash
git clone <url> reecriture && cd reecriture
git fetch origin 'refs/heads/*:refs/remotes/origin/*'
git filter-repo --path .env.local.staging --invert-paths
```

`--invert-paths` retire le fichier de tous les commits de toutes les branches du clone. Vérifier :

```bash
git log --all --oneline -- .env.local.staging        # doit ne rien afficher
git rev-list --all | wc -l                           # même ordre de grandeur qu'avant
```

Les hachages de tous les commits postérieurs à `2461882` changent, donc ceux de la branche `77-migre-vers-wdio-10`.

## 4. Poussée (décision de l'utilisateur)

`git filter-repo` retire le remote `origin` ; le rajouter, puis pousser **la branche concernée seulement**, avec une garde :

```bash
git remote add origin <url>
git push --force-with-lease=77-migre-vers-wdio-10:<ancien hachage de origin/77-migre-vers-wdio-10> origin 77-migre-vers-wdio-10
```

- Ne jamais pousser `main` (protégée, et le fichier n'y est pas).
- Les PR ouvertes depuis cette branche restent liées à l'ancien commit tant que GitHub garde ses références `refs/pull/*` : ces références
  conservent l'ancien contenu. Demander au support GitHub de purger les objets orphelins et les caches de vues (« sensitive data removal »),
  ou, plus simplement, considérer les secrets comme compromis (étape 1) et fermer puis rouvrir la PR depuis la branche réécrite.
- Les forks et les clones existants gardent l'ancien historique : rien ne les purge à distance.

## 5. Vérifier qu'aucun autre fichier suivi ne contient de secret

Sans jamais afficher de valeur :

```bash
# noms des fichiers qui, à un moment de l'historique, ont eu une ligne « NOM_SECRET=valeur non vide »
git log --all -G'^(NOTIF_PARTNER[A-Z_]*_SECRET|WEB_APP_ACCESS_KEYS|PARTNERS_[A-Z_]*_SECRET)=.+' --name-only --format= | sort -u
```

Le gabarit `.env` doit apparaître vide (clés sans valeur). Tout autre fichier listé est à traiter de la même façon que `.env.local.staging`
(retrait de l'historique et rotation).

## 6. Après la poussée : reprise des clones, branches et worktrees

- Autres clones : `git fetch origin && git checkout <branche> && git reset --hard origin/<branche>` (perd les commits locaux non poussés :
  les sauvegarder d'abord, par exemple `git branch sauvegarde-<branche>`).
- Branches locales dérivées de l'ancienne branche : `git rebase --onto origin/77-migre-vers-wdio-10 <ancien hachage de la base> <branche>`.
- Worktrees (dont ceux des agents) : les supprimer (`git worktree remove`) et les recréer depuis la nouvelle branche ; leurs branches
  portent les anciens hachages.
- Supprimer la sauvegarde miroir une fois les secrets renouvelés et tout le monde resynchronisé, car elle contient toujours l'ancien fichier.

## Retour arrière

Tant que la sauvegarde miroir existe, `git push --force origin <ancien hachage>:refs/heads/77-migre-vers-wdio-10` depuis elle rétablit l'état
d'avant. Ce n'est pas souhaitable : les secrets compromis resteraient exposés.
