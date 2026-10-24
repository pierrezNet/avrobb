# CLAUDE.md

Guide pour Claude Code dans ce dépôt. À lire avant toute action.

## Nature du projet

**pv-forum** : réécriture en Node.js / TypeScript du forum **Pilote-Virtuel.com** (FluxBB 1.5.4 très personnalisé), situé dans `/var/www/html/PiloteVirtuel` (= `/media/emmanuel-pierrez/OpenData/html/PiloteVirtuel`, même dossier physique, disque NTFS).

Stratégie de migration **page par page (« strangler fig »)** : Node et PHP partagent **la même base MariaDB** (schéma FluxBB, préfixe `fo_`) et **le même cookie de session**. Une page portée est servie par Node ; tous les autres liens renvoient vers l'installation PHP (`LEGACY_BASE_URL`). À tout moment, le forum doit rester utilisable de bout en bout.

- Plan et avancement : **`TODO.md`** (lots fonctionnels ordonnés).
- Référence fonctionnelle : le code PHP et son `CLAUDE.md` (cycle de requête, plugins, cache, encodage Latin-1/CRLF).

## Commandes

```bash
npm run dev        # tsx watch, http://localhost:3000/viewtopic.php?id=4
npm test           # vitest
npm run typecheck  # tsc --noEmit (TypeScript strict)
npm run lint       # Biome (lint + format, vérification seule)
npm run format     # Biome : corrige le formatage et l'ordre des imports
npm run check      # lint + typecheck + test : à lancer avant chaque commit
npm run test:db    # tests d'intégration sur une vraie base (pv_forum_test, recréée à chaque lancement)
npm run parity -- 'viewtopic.php?id=4' [--cookie punbb_cookie_local=…]   # écarts de texte/liens PHP ↔ Node
npm run screenshot -- 'http://localhost:3000/viewtopic.php?id=4' --widths 320,375,768,1280 [--cookie …]
```

Pré-requis : la pile Docker du projet PHP (`cd /var/www/html/PiloteVirtuel && sg docker -c "docker compose up -d"`) : MariaDB sur `127.0.0.1:3307`, forum PHP sur `:8080`, phpMyAdmin sur `:8081`. `.env` est copié depuis `.env.example` ; `LEGACY_COOKIE_SEED` = `$cookie_seed` du `config.php` PHP.

**Définition de « terminé »** : `npm run check` et `npm run test:db` passent, `npm run parity` ne montre que des écarts assumés (notés dans le README), et la page a été vérifiée à la main dans le navigateur face à la page PHP équivalente, sur mobile comme sur bureau.

## Pile technique

Node ≥ 24 (ESM, `"type": "module"`), TypeScript exécuté par `tsx` (imports avec extension `.ts`), **Fastify 5**, **Kysely** + `mysql2` (SQL typé), **Nunjucks** (échappement automatique, `throwOnUndefined`), **Vitest**. N'ajoute pas de dépendance sans raison claire : on préfère la bibliothèque standard de Node et ce qui est déjà installé.

## Architecture MVC (règles strictes)

| Couche       | Dossier             | A le droit de                                                                    | N'a pas le droit de                                                          |
| ------------ | ------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Domaine      | `src/domain/`       | types métier (booléens, noms explicites)                                         | importer quoi que ce soit d'autre                                            |
| Repositories | `src/repositories/` | **seul endroit avec du SQL** (Kysely), conversion ligne → domaine                | logique d'affichage, HTTP                                                    |
| Services     | `src/services/`     | règles métier **pures** (permissions, BBCode, dates, pagination, session)        | accès base, HTTP                                                             |
| Presenters   | `src/presenters/`   | domaine → modèle de vue, **fonction pure**                                       | requêtes, `reply`                                                            |
| Contrôleurs  | `src/controllers/`  | lire la requête, appeler repositories, services et presenter, choisir la réponse | SQL, HTML, règles métier                                                     |
| Vues         | `src/views/`        | balisage Nunjucks                                                                | calculs, conditions métier (au-delà d'un `if` sur un champ du modèle de vue) |
| HTTP         | `src/http/`         | contexte de mise en page commun, session, hooks                                  | —                                                                            |

Principes :
- **Injection de dépendances** : chaque contrôleur reçoit ses dépendances sous forme d'interfaces `XxxReader` / `XxxWriter` (voir `AppDeps` dans `src/app.ts`). `server.ts` câble les vraies, les tests passent des doublures en mémoire (`tests/fixtures.ts`).
- **Découpage par fonctionnalité** à mesure que le projet grossit : un contrôleur, un presenter et une vue par page ; les repositories sont organisés par table ou agrégat.
- Les **règles de droits** vivent dans `services/permissions.ts` (ou un fichier par domaine) et ne sont jamais recopiées dans une vue ou un contrôleur.
- **Dates** : timestamps Unix (secondes) jusqu'au presenter ; formatage en dernier ; horloge injectée (`PageContext.clock`). PV a modifié `format_time()` : formats fixes `d/m/Y` et `H:i` (`viewerTimeSettings()`), pas `o_date_format`.
- **Mise en page** : un contrôleur rend sa page avec `renderPage(request, reply, deps, 'page.njk', options, view)` ; `options` (`PageOptions`) décrit le titre, l'onglet actif et le pied (`footer`). Réglages et utilisateur sont sur `request.board` et `request.viewer` (hook `authenticate` déclaré par route).
- **Configuration** : `ConfigLoader` lit `cache/cache_config.php` comme `common.php` (sinon la table) ; après une écriture dans `config`, appeler `invalidate()`.
- **Textes** : tous dans `src/lang/fr/` (un fichier par page), aucune chaîne en dur dans les vues ou les presenters.

## Cohabitation avec le PHP (critique)

- **Base partagée** : on ne modifie **pas** le schéma FluxBB. Une écriture faite par Node doit laisser la base dans un état que le PHP comprend : compteurs `num_posts`/`num_replies`/`last_post*`, index de recherche (`search_words` / `search_matches`), `online`, abonnements… Reproduire fidèlement les effets de bord du PHP équivalent.
- **Caches PHP** (`cache/cache_*.php`) : si Node modifie `config`, `bans`, `censoring`, `forums`, `smilies` ou `users_info`, il doit **supprimer le fichier de cache PHP correspondant** via `PhpCacheStore.invalidate()` (le PHP le régénère). Ces fichiers se lisent avec `parsePhpCacheVariable()` (sous-ensemble de `var_export`, jamais d'évaluation).
- **Session** : le cookie FluxBB (`services/legacySession.ts`) est la source de vérité. Une connexion faite par Node doit émettre exactement le même format de cookie que `pun_setcookie()`.
- **Liens** : utiliser `url('page.php?…')` dans les vues ; ajouter la page à `PORTED_PAGES` (`src/app.ts`) quand elle est portée. On conserve les **mêmes URL** (`viewtopic.php?id=…`) pour ne casser ni les liens externes ni le référencement.
- **Page portée en partie** (`profile.php`, `gallery.php`) : Node sert la consultation et **redirige vers `LEGACY_BASE_URL`** les cas qui écrivent (paramètres `section`, `action`, `info`…), jusqu'au lot qui les porte.
- **Pages qui écrivent en PHP mais pas encore en Node** (recherche : `search_cache`, anti-flood) : on recalcule sans écrire et on le note dans le README.
- **Parseur BBCode** : tout changement de `services/bbcode.ts` se vérifie contre le vrai parseur PHP (`npm run bbcode:reference` puis `tests/bbcode/`). PV a aussi réécrit `paginate()` (pages voisines ±1).
- **Mots de passe** : FluxBB stocke du SHA-1. Il faut rester compatible tant que le PHP tourne (évolution vers argon2 possible uniquement après la bascule, voir TODO).
- Le code PHP sert de **référence en lecture**. On ne le modifie qu'en cas de besoin réel et en respectant ses contraintes (Latin-1 + CRLF, `grep -a`, voir son `CLAUDE.md`).

## Sécurité (non négociable)

- Échappement automatique Nunjucks ; `| safe` seulement sur du HTML produit par `parseBbcode` (sûr par construction) et commenté. Seule autre exception : le HTML saisi par l'administrateur dans les options (`o_announcement_message`, `o_additional_navlinks`), affiché tel quel comme le fait le PHP ; ces champs portent le préfixe `trustedHtml`/`…Html` dans les modèles de vue.
- Requêtes uniquement via Kysely (paramétrées) ; jamais de SQL concaténé avec des entrées utilisateur.
- **Jeton CSRF** sur tout formulaire en POST ; aucune écriture en GET.
- Valider et typer toutes les entrées (paramètres de requête, corps de formulaire) dès le contrôleur, avec des schémas Fastify ou de petites fonctions dédiées (`positiveInt`…).
- Vérifier les droits côté serveur dans le contrôleur, même quand la vue masque déjà le lien.
- Fichiers téléversés (avatars, uploads, galerie) : contrôler type, taille et chemin (pas de traversée de répertoire).

## Style de code

- Indentation par **tabulations**, apostrophes simples, points-virgules, `const` par défaut.
- **Commentaires et textes en français**, comme dans le code existant : un en-tête `/** … */` par fichier qui explique son rôle, des commentaires sur le _pourquoi_ (surtout les écarts ou fidélités à FluxBB), pas sur le _quoi_.
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) : pas de `any`, pas de `!` sans justification.
- Fonctions courtes, noms explicites ; une règle FluxBB reproduite cite la fonction PHP d'origine (`get_title()`, `paginate()`…).
- Tests : chaque service pur a ses tests unitaires ; chaque page a au moins un test d'intégration via `app.inject()` avec des doublures.

## Front-end responsive

- Rendu **côté serveur** ; JavaScript uniquement en amélioration progressive (le forum doit fonctionner sans JS).
- **Mobile d'abord** : la mise en page de base est pensée pour mobile, puis élargie avec des `@media (min-width: …)`. Pas de tableaux de mise en page ; les listes de forums et de sujets passent en cartes empilées sur petit écran.
- Les 6 thèmes FluxBB (Air, Lagon, GreenDeal, GreenDark, GlowingRed, fiftyGrey) sont réduits à des **variables CSS** (couleurs) ; la structure et le responsive sont communs.
- Accessibilité : HTML sémantique, `lang`, libellés de formulaire, contraste, focus visible, cibles tactiles d'au moins 44 px.

## Skills du projet

Dans `.claude/skills/` :
- **`port-page`** : procédure complète pour porter une page PHP vers Node.
- **`mvc-review`** : grille de relecture (couches, sécurité, cohabitation, tests) à passer avant de considérer un lot terminé.
- **`responsive-ui`** : règles CSS et gabarits pour les vues.

## Environnement

- `/var/www/html` est un lien vers un disque **NTFS** : permissions forcées à 777, `chmod` sans effet. Ne pas se fier aux droits Unix.
- Docker s'utilise via `sg docker -c "…"`.
- Langue de travail : **français**.
