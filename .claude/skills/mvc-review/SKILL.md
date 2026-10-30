---

name: mvc-review
description: Grille de relecture d'AvroBB (architecture en couches, code propre, sécurité, contraintes Cloudflare Workers et D1, tests). À passer sur tout code modifié avant de considérer une page ou un lot de TODO.md comme terminé, ou quand on demande une relecture.
---

# Relecture AvroBB

Passer chaque point sur le diff. Corriger directement ce qui est simple, signaler le reste.

## Couches

- [ ] Du SQL (et, à partir du lot 4, des accès R2) n'apparaît **que** dans `src/repositories/`.
- [ ] Les contrôleurs ne contiennent ni SQL, ni HTML, ni règle métier : ils orchestrent seulement.
- [ ] Les presenters et services sont **purs** : pas d'`await` sur la base, pas de réponse HTTP, pas de `fetch`, pas de `Date.now()` (l'horloge est injectée).
- [ ] Les vues ne calculent rien ; les conditions portent sur des champs déjà préparés par le presenter.
- [ ] Les dépendances passent par des interfaces (`XxxReader` / `XxxWriter`) injectées et ont une doublure dans `tests/fixtures.ts`.
- [ ] Les règles de droits ne sont pas dupliquées : elles vivent dans un service.
- [ ] Les services externes (OAuth, e-mail) passent par un adaptateur de `src/adapters/`.

## Code propre

- [ ] Fonctions courtes à responsabilité unique, noms explicites, pas de code mort ni de `console.log`.
- [ ] Pas de `any` ni d'assertion `!` injustifiée ; types du domaine plutôt que lignes brutes de la base.
- [ ] Pas de duplication avec un service existant (`pagination`, `dateFormat`, `permissions`, `bbcode`…).
- [ ] Commentaires en français, sur le _pourquoi_ ; en-tête de fichier présent.
- [ ] Style respecté : tabulations, apostrophes simples, imports `.ts` ; Biome sans avertissement.
- [ ] Textes dans `src/lang/fr/` (un fichier par page), pas en dur ; aucune clé de langue manquante dans les vues (Nunjucks échoue sur une valeur indéfinie, y compris derrière un alias `t.`).

## Sécurité

- [ ] Toutes les entrées sont validées et typées (identifiants entiers positifs, longueurs, énumérations).
- [ ] Les droits sont vérifiés côté serveur pour chaque action, pas seulement masqués dans la vue.
- [ ] Les POST vérifient le CSRF ; aucune écriture en GET (hors exceptions listées dans `CLAUDE.md`).
- [ ] `| safe` n'est utilisé que sur du HTML sûr par construction, avec un commentaire.
- [ ] Fichiers envoyés : type lu dans le contenu, taille et dimensions plafonnées, nom de stockage généré par le serveur.
- [ ] Les erreurs ne divulguent ni SQL, ni chemins, ni pile d'appels ; aucun secret dans le code ou les journaux.
- [ ] Toute nouvelle origine externe (OAuth, API, médias) est ajoutée explicitement à la CSP si nécessaire.

## Workers et D1

- [ ] Rien au chargement des modules (pas de lecture, de calcul ni de connexion à la portée globale).
- [ ] Pas d'API Node absente des Workers (`fs`, `path` hors outillage, `dns`, `os`, `child_process`) dans le code applicatif.
- [ ] Pas de transaction interactive : une écriture en plusieurs requêtes est un lot atomique (`batch`), sans lecture intermédiaire ; compteurs mis à jour de façon relative.
- [ ] Pas d'état global utilisé comme source de vérité (un cache en mémoire a une durée de vie courte).
- [ ] Les pages publiques ne posent aucun cookie pour les visiteurs (condition du cache en bordure).
- [ ] Le nombre de lignes lues et écrites par page reste raisonnable (index adaptés, pas de `COUNT(*)` sur une grande table à chaque page).

## Responsive et accessibilité

- [ ] Le skill `responsive-ui` est respecté (mobile d'abord, aucun défilement horizontal à 320 px, fonctionne sans JavaScript).

## Tests

- [ ] Services et presenter testés, y compris les cas de droits limites.
- [ ] Test d'intégration de la page avec les doublures.
- [ ] Repository testé sur une vraie base (`tests/db/`).
- [ ] `npm run check` et `npm run test:db` passent.
