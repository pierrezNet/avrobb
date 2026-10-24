---

name: mvc-review
description: Grille de relecture de pv-forum (architecture MVC, code propre, sécurité, cohabitation avec le PHP, tests). À passer sur tout code modifié avant de considérer une page ou un lot de TODO.md comme terminé, ou quand on demande une relecture.
---

# Relecture pv-forum

Passer chaque point sur le diff. Corriger directement ce qui est simple, signaler le reste.

## Couches

- [ ] Du SQL n'apparaît **que** dans `src/repositories/`.
- [ ] Les contrôleurs ne contiennent ni SQL, ni HTML, ni règle métier : ils orchestrent seulement.
- [ ] Les presenters et services sont **purs** : pas d'`await` sur la base, pas de `reply`, pas de `Date.now()` (l'horloge est injectée).
- [ ] Les vues ne calculent rien ; les conditions portent sur des champs déjà préparés par le presenter.
- [ ] Les dépendances passent par des interfaces (`XxxReader` / `XxxWriter`) injectées et ont une doublure dans `tests/fixtures.ts`.
- [ ] Les règles de droits ne sont pas dupliquées : elles vivent dans un service.

## Code propre

- [ ] Fonctions courtes à responsabilité unique, noms explicites, pas de code mort ni de `console.log`.
- [ ] Pas de `any` ni d'assertion `!` injustifiée ; types du domaine plutôt que lignes brutes de la base.
- [ ] Pas de duplication avec un service existant (`pagination`, `dateFormat`, `permissions`, `bbcode`…).
- [ ] Commentaires en français, sur le _pourquoi_ ; en-tête de fichier présent.
- [ ] Style respecté : tabulations, apostrophes simples, imports `.ts`.
- [ ] Textes dans `src/lang/fr.ts`, pas en dur.

## Sécurité

- [ ] Toutes les entrées sont validées et typées (identifiants entiers positifs, longueurs, énumérations).
- [ ] Les droits sont vérifiés côté serveur pour chaque action, pas seulement masqués dans la vue.
- [ ] Les POST vérifient le CSRF ; aucune écriture en GET.
- [ ] `| safe` n'est utilisé que sur du HTML sûr par construction, avec un commentaire.
- [ ] Pas de traversée de chemin, et un contrôle de type et de taille sur les fichiers.
- [ ] Les erreurs ne divulguent ni SQL, ni chemins, ni pile d'appels.

## Cohabitation avec le PHP

- [ ] Les écritures reproduisent tous les effets de bord du PHP (compteurs, `last_post*`, index de recherche, abonnements, `online`).
- [ ] Les écritures liées sont dans une transaction.
- [ ] Les caches PHP concernés (`cache/cache_*.php`) sont invalidés.
- [ ] Le format du cookie et des hash est identique à FluxBB.
- [ ] Les URL sont identiques à celles du PHP ; la page est ajoutée à `PORTED_PAGES`.
- [ ] Le résultat d'une écriture Node s'affiche correctement côté PHP.

## Responsive et accessibilité

- [ ] Le skill `responsive-ui` est respecté (mobile d'abord, aucun défilement horizontal à 320 px).

## Tests

- [ ] Services et presenter testés, y compris les cas de droits limites.
- [ ] Test d'intégration `app.inject()` de la page.
- [ ] `npm run typecheck && npm test` passent.
