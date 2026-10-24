---
name: port-page
description: Procédure pour porter une page PHP de Pilote-Virtuel (FluxBB) vers pv-forum en Node/TypeScript MVC. À utiliser dès qu'on commence le portage d'une page ou d'une fonctionnalité de TODO.md (viewforum, post, profile, pms…).
---

# Porter une page PHP vers pv-forum

Le code PHP de référence se trouve dans `/var/www/html/PiloteVirtuel`. Il est en **Latin-1 + CRLF** : lire avec `grep -a`, ou `iconv -f latin1 -t utf8 fichier | …` pour l'afficher. Ne jamais l'enregistrer en UTF-8.

## 1. Comprendre le comportement (avant tout code)

1. Lire la page PHP en entier, ainsi que ce qu'elle inclut : `include/functions.php`, `parser.php`, `lang/French/<page>.php`, et les plugins ou plugiles concernés.
2. Dresser la **liste des comportements** dans la PR ou dans un commentaire de suivi :
   - paramètres GET et POST acceptés et leur validation ;
   - contrôles de droits (`g_*`, `forum_perms`, `is_admmod`, propriétaire…) et messages d'erreur associés ;
   - requêtes SQL : tables lues et écrites, **effets de bord** (compteurs, `last_post`, index de recherche, `online`, caches PHP à invalider) ;
   - redirections, sortie HTML, textes de langue utilisés.
3. Repérer ce qui est **propre à Pilote-Virtuel** (comparer avec FluxBB 1.5.4 standard) et le signaler.
4. Noter les écarts assumés (bugs PHP qu'on ne reproduit pas, simplifications) : ils iront dans le README.

## 2. Implémenter, couche par couche (de l'intérieur vers l'extérieur)

1. **Schéma** : compléter `src/db/schema.ts` avec les tables et colonnes utilisées, et ajouter la table à `TABLE_NAMES`.
2. **Domaine** : types dans `src/domain/` (booléens au lieu de 0/1, noms explicites en camelCase).
3. **Repository** : interface `XxxReader` / `XxxWriter` + implémentation Kysely. Les écritures liées passent par **une transaction** (`db.transaction()`), et reproduisent tous les effets de bord relevés à l'étape 1.
4. **Services purs** : règles de droits (`services/permissions.ts` ou fichier dédié), calculs, formatage. Testés unitairement.
5. **Presenter** : `buildXxxPage(input): XxxPageView`, fonction pure. Toute la logique d'affichage est ici.
6. **Contrôleur** : validation des entrées → droits → repositories → presenter → `reply.view()`, `redirect()` ou `renderMessage()`. En POST : vérifier le jeton CSRF puis appliquer le motif POST → redirection → GET.
7. **Vue** Nunjucks : `{% extends "layout.njk" %}`, aucun calcul, textes via `lang.*`, liens via `url()`. Appliquer le skill `responsive-ui`.
8. **Câblage** : route dans `src/app.ts` (même URL que le PHP, par exemple `/viewforum.php`), dépendances dans `AppDeps` et `server.ts`, page ajoutée à `PORTED_PAGES`.
9. **Langue** : nouvelles chaînes dans `src/lang/fr.ts`, reprises du fichier `lang/French/` correspondant (converti en UTF-8).

## 3. Tester

- Tests unitaires des services et du presenter (cas de droits : invité, membre, modérateur du forum, administrateur, sujet fermé…).
- Test d'intégration avec `app.inject()` et les doublures de `tests/fixtures.ts` : statut, redirections, présence ou absence des actions.
- Pour les écritures : test contre la base de test, puis vérification que **la page PHP équivalente affiche correctement** le résultat.
- Vérification manuelle : `npm run dev`, comparer avec `http://localhost:8080/<page>.php` en vue mobile (375 px) et bureau.

## 4. Clore

- `npm run typecheck && npm test` passent.
- Passer le skill `mvc-review`.
- Cocher la ligne dans `TODO.md` et mettre à jour les « Écarts connus » du README.
