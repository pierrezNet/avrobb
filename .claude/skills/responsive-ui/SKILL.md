---
name: responsive-ui
description: Règles de front-end de pv-forum pour les vues Nunjucks et le CSS (mobile d'abord, thèmes FluxBB en variables CSS, accessibilité, JS en amélioration progressive). À utiliser pour écrire ou modifier une vue `.njk`, une feuille de style ou un script côté navigateur.
---

# Vues et CSS responsive

## Principes

- **Rendu serveur**, page complète et fonctionnelle **sans JavaScript**. Le JS (barre d'outils BBCode, réponse rapide, aperçu) n'est qu'une amélioration progressive, chargé en `defer`, sans framework.
- **Mobile d'abord** : les styles de base ciblent un écran de 320 à 480 px, puis on élargit avec `@media (min-width: 48em)` (tablette) et `@media (min-width: 64em)` (bureau). Pas de `max-width` pour casser la mise en page.
- Aucun défilement horizontal à 320 px. Les contenus larges (blocs `code`, images, tableaux du BBCode) ont `max-width: 100%` ou `overflow-x: auto` sur leur conteneur.

## Structure HTML

- HTML sémantique : `header`, `nav`, `main`, `footer`, `article` pour un message, `h1` à `h3` hiérarchisés, listes (`ul`/`ol`) pour les forums et les sujets.
- **Pas de tableaux de mise en page.** Une liste de forums ou de sujets est une liste de cartes : en grille de colonnes sur bureau (CSS Grid), empilée sur mobile (titre, puis méta-informations sur une ligne secondaire).
- Message (`viewtopic`) : sur mobile, l'auteur passe **au-dessus** du message, en bandeau compact (avatar réduit, pseudo, titre) ; sur bureau, il revient en colonne à gauche.
- Menu principal : liste en ligne sur bureau, menu repliable sur mobile (`<details>`/`<summary>`, sans JS).
- Pagination et actions (citer, éditer…) : liens sous forme de boutons d'au moins **44×44 px** sur écran tactile.
- Formulaires : chaque champ a son `<label>`, avec le bon `type` (`email`, `number`, `search`) et `autocomplete`. Une colonne sur mobile.

## CSS

- Une feuille de base commune (`public/css/base.css`) pour la structure, la typographie et le responsive, plus une petite feuille par thème qui ne définit **que des variables** :
  ```css
  :root { --color-bg: …; --color-text: …; --color-accent: …; --color-border: …; --color-header-bg: …; }
  ```
  Les 6 thèmes FluxBB (Air, Lagon, GreenDeal, GreenDark, GlowingRed, fiftyGrey) sont convertis à partir de `/var/www/html/PiloteVirtuel/style/*.css`.
- Unités relatives (`rem`, `em`, `%`, `ch`) ; taille de base 16 px ; longueur de ligne des messages limitée à environ 75 ch sur grand écran.
- Classes nommées par composant (`.post`, `.post__author`, `.topic-list`, `.pagination`) et non par apparence. Pas de `!important`, pas de styles en ligne.
- Images : `max-width: 100%; height: auto;`, avec `loading="lazy"` sur les avatars et les images des messages.

## Accessibilité

- `lang="fr"`, un `title` de page unique, un lien d'évitement « Aller au contenu ».
- Contraste AA minimum dans **chaque** thème ; `:focus-visible` toujours visible.
- Les icônes (lu/non lu, épinglé, fermé) ont un équivalent textuel (`aria-label` ou texte masqué visuellement).
- Respect de `prefers-reduced-motion`.

## Vérification

Tester chaque vue à 320 px, 375 px, 768 px et 1280 px, au clavier seul, et avec au moins un thème clair (Air) et un thème sombre (GreenDark).
