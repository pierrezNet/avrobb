---

name: new-page
description: Procédure pour ajouter ou refondre une page ou une fonctionnalité d'AvroBB en Node/TypeScript (architecture en couches, tests, vérifications). À utiliser dès qu'on commence une page ou une fonctionnalité de TODO.md.
---

# Ajouter une page à AvroBB

AvroBB descend de FluxBB : quand une fonction existe dans FluxBB 1.5.4, son comportement sert de point de départ (citer la fonction PHP d'origine dans les commentaires), mais rien n'oblige à le reproduire. Le code PHP n'est plus disponible sur la machine : on part du code d'AvroBB et de ses tests.

## 1. Cadrer (avant tout code)

1. Écrire la liste des comportements attendus : paramètres GET et POST et leur validation, droits (groupe, propriétaire, modérateur du forum…), données lues et écrites, effets de bord (compteurs, index de recherche, présence, notifications), redirections, textes.
2. Vérifier la compatibilité avec la cible Cloudflare (`CLAUDE.md`, « Limites Cloudflare ») : pas de transaction interactive, pas d'API Node absente des Workers, pas de cookie sur une page publique.
3. Noter les choix qui s'écartent de FluxBB : ils iront dans le README (« Différences avec FluxBB »).

## 2. Implémenter, de l'intérieur vers l'extérieur

1. **Schéma** : tables et colonnes dans `src/db/schema.ts` (et, à partir du lot 3, migration SQL numérotée dans `migrations/`).
2. **Domaine** : types dans `src/domain/` (booléens plutôt que 0/1, noms explicites en camelCase).
3. **Repository** : interface `XxxReader` / `XxxWriter` + implémentation Kysely. Les écritures liées forment un lot atomique et reproduisent tous les effets de bord relevés à l'étape 1.
4. **Services purs** : règles de droits (`services/permissions.ts` ou fichier dédié), calculs, formatage.
5. **Presenter** : `buildXxxPage(input): XxxPageView`, fonction pure. Toute la logique d'affichage est ici.
6. **Contrôleur** : validation des entrées → droits → repositories → presenter → page, redirection ou message. En POST : jeton CSRF vérifié en amont, puis POST → redirection → GET.
7. **Vue** Nunjucks : `{% extends "layout.njk" %}`, aucun calcul, textes via `lang.*`, liens via `url()`. Appliquer le skill `responsive-ui`.
8. **Câblage** : route dans `src/app.ts`, dépendances dans `AppDeps`, implémentation réelle dans le point d'entrée (`server.ts`, puis `worker.ts` au lot 3), doublure dans `tests/fixtures.ts`.
9. **Langue** : nouvelles chaînes dans `src/lang/fr/` (un fichier par page).

## 3. Tester

- Tests unitaires des services et du presenter (cas de droits : invité, membre, modérateur du forum, administrateur, banni, sujet fermé…).
- Test d'intégration avec les doublures de `tests/fixtures.ts` : statut, redirections, présence ou absence des actions, refus sans jeton CSRF.
- Repository sur une vraie base dans `tests/db/` (compléter le jeu de données si besoin) : `npm run test:db`.
- Vérification visuelle : `npm run screenshot -- '<adresse>' --widths 320,375,768,1280` (avec `--cookie avrobb_session=…` pour un membre), en thème clair (Air) et sombre (GreenDark), avec et sans JavaScript.

## 4. Clore

- `npm run check` et `npm run test:db` passent.
- Passer le skill `mvc-review`.
- Cocher la ligne dans `TODO.md` et mettre à jour le README si un comportement diffère de FluxBB.
