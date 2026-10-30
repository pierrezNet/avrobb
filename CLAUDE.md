# CLAUDE.md

Guide pour Claude Code dans ce dépôt. À lire avant toute action.

## Nature du projet

**AvroBB** : forum personnel d'Emmanuel Pierrez, un lieu d'échange autour de ses projets personnels. Lecture publique, écriture réservée aux membres, comptes créés par **SSO uniquement** (GitHub, Google en option).

Le code part d'un clone de **pv-forum**, la réécriture Node.js/TypeScript du forum Pilote-Virtuel (FluxBB 1.5.4). AvroBB en est **indépendant** : pas de cohabitation avec un PHP, pas de base partagée, pas de compatibilité de schéma FluxBB. Le remote `pv` pointe vers pv-forum. On y récupère des corrections au cas par cas (`git fetch pv` puis `git cherry-pick`), en les adaptant : ce qui touche à la base, à la session ou au PHP ne s'applique pas tel quel.

Cible : **100 % Cloudflare**. Un Worker (Hono), D1 (SQLite), R2 (fichiers), Static Assets (CSS, JS, icônes), déploiement par GitHub Actions et Wrangler, cache en bordure pour les visiteurs non connectés. Budget de 7 €/mois au plus : **Workers Paid à 5 $/mois** (voir « Limites Cloudflare »).

- Plan et avancement : **`TODO.md`** (lots ordonnés, chacun livrable et testé).
- `AMELIORATIONS.md` (non versionné) : améliorations par rapport au forum PHP d'origine, à tenir à jour.
- `FAILLES_PHP.md` (non versionné) : failles du PHP d'origine, liste de contrôle à ne pas reproduire.
- Projet voisin sur le même modèle (Workers + D1 + Hono) : `../donnetonpoint`.

> **Transition en cours** : lots 1 à 6 bis terminés (héritage PV retiré, Hono, base D1, Worker et R2, SSO, images et e-mails, URL propres). Le forum tourne sous `wrangler dev`. Ce fichier décrit la **cible** : les cookies `__Host-`, la commande `npm run deploy` et le déploiement par GitHub Actions (lot 7) restent à faire.

## Commandes

```bash
npm run dev        # wrangler dev : Worker local, D1 et R2 locaux (Miniflare), http://localhost:8787 ; secrets dans .dev.vars
npm run build      # précompile les gabarits Nunjucks et le manifeste des ressources (src/generated/)
npm test           # vitest (Node) : services, presenters, contrôleurs avec doublures
npm run test:db    # repositories sur une vraie D1 locale (getPlatformProxy), migrations rejouées à chaque lancement
npm run typecheck  # tsc --noEmit (TypeScript strict)
npm run lint       # Biome (lint + format, vérification seule)
npm run format     # Biome : corrige le formatage et l'ordre des imports
npm run check      # lint + typecheck + test : à lancer avant chaque commit
npm run db:migrate # wrangler d1 migrations apply (base locale ; --remote au lot 7)
npm run deploy     # build puis wrangler deploy (normalement fait par GitHub Actions)
npm run screenshot -- 'http://localhost:8787/viewtopic.php?id=4' --widths 320,375,768,1280
```

**Définition de « terminé »** : `npm run check` et `npm run test:db` passent, la fonctionnalité a été vérifiée à la main sous `wrangler dev` sur mobile comme sur bureau (avec et sans JavaScript), et `mvc-review` a été passée.

## Pile technique

- **Runtime** : Cloudflare Workers (`compatibility_flags = ["nodejs_compat"]`), configuration dans `wrangler.jsonc`. Node ≥ 24 pour l'outillage (ESM, `"type": "module"`, imports avec extension `.ts`).
- **HTTP** : **Hono**. Les contrôleurs ne voient pas Hono directement : ils reçoivent `AppRequest` et `AppReply` (`src/http/context.ts`), et `src/http/server.ts` fait le lien avec Hono (routes, étapes préalables, erreurs, en-têtes, fichiers statiques).
- **Base** : **D1** via **Kysely** (dialecte SQLite, pilote D1 maison de quelques dizaines de lignes dans `src/db/`). Schéma neuf, migrations SQL numérotées dans `migrations/` (`wrangler d1 migrations`).
- **Fichiers** : **R2** (avatars, galerie, logo, bannière) derrière l'interface `FileStore` (`repositories/FileStore.ts`), servis par le Worker sous `/img/` (même origine) avec cache en bordure.
- **Gabarits** : **Nunjucks précompilé** au build (`nunjucks.precompile` vers un module ES dans `src/generated/`), chargé par `PrecompiledLoader`. Un Worker n'a ni système de fichiers ni `eval` : on ne compile **jamais** un gabarit à l'exécution. Échappement automatique, `throwOnUndefined`.
- **Ressources statiques** : `public/assets/` servi sous `/assets/` par Workers Static Assets, sans passer par le Worker (en-têtes dans `public/_headers`). Empreintes (`?v=…`) calculées au build dans un manifeste (`src/generated/assets.js`), pas à l'exécution.
- **Recherche** : index de mots de FluxBB (`search_words`, `search_matches`) ; FTS5 de SQLite reste une option.
- **E-mails** : interface `Mailer`. Pas de SMTP : une API HTTP (Resend, comme donnetonpoint), ou le journal (`LogMailer`) tant qu'aucune clé n'est configurée.
- **Images** : pas de sharp. Le navigateur redimensionne et convertit en WebP (canvas) avant l'envoi ; le serveur vérifie type (contenu), dimensions (en-tête du fichier) et taille.
- **Tests** : **Vitest**. Outillage : **Biome**, **Wrangler**.

N'ajoute pas de dépendance sans raison claire. Chaque octet compte dans le bundle du Worker : on préfère les API Web standard (`fetch`, `crypto.subtle`, `Request.formData()`, `URL`) et ce qui est déjà installé.

## Limites Cloudflare (à garder en tête)

- **CPU** : 10 ms par requête sur l'offre gratuite, trop juste pour rendre un sujet (BBCode + Nunjucks). Sur Workers Paid, 30 s par défaut. On mesure quand même (`wrangler tail`, onglet Observabilité) : une page doit rester sous ~50 ms de CPU.
- **Mémoire** : 128 Mo par isolat. Pas de fichier entier en mémoire au-delà de quelques Mo ; limite d'envoi fixée dans `http/forms.ts`.
- **Bundle** : 10 Mo compressé (Paid), 3 Mo (gratuit). Surveiller la taille des gabarits compilés et des dépendances.
- **Démarrage** : le code de portée globale doit rester léger (pas de calcul ni de lecture au chargement du module).
- **Pas d'état global fiable** : un isolat peut être recyclé à tout moment et plusieurs tournent en parallèle. Un cache en mémoire n'est qu'une optimisation avec durée de vie courte, jamais une source de vérité.
- **D1** : **pas de transaction interactive** (`BEGIN`/`COMMIT` interdits). Une écriture en plusieurs requêtes passe par `db.batch()` (atomique), avec des sous-requêtes ou `RETURNING` à la place des lectures intermédiaires. Les lectures préalables se font avant le lot, en acceptant la concurrence (contraintes `UNIQUE`, mises à jour relatives `x = x + 1`). Compter les lignes écrites : chaque écriture et chaque index modifié sont facturés.

## Architecture en couches (règles strictes)

| Couche       | Dossier             | A le droit de                                                                     | N'a pas le droit de                                                          |
| ------------ | ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Domaine      | `src/domain/`       | types métier (booléens, noms explicites)                                          | importer quoi que ce soit d'autre                                            |
| Repositories | `src/repositories/` | **seul endroit avec du SQL** (Kysely) et des accès R2, conversion ligne → domaine | logique d'affichage, HTTP                                                    |
| Services     | `src/services/`     | règles métier **pures** (permissions, BBCode, dates, pagination, session)         | accès base ou R2, HTTP, `fetch`                                              |
| Presenters   | `src/presenters/`   | domaine → modèle de vue, **fonction pure**                                        | requêtes, réponse HTTP                                                       |
| Contrôleurs  | `src/controllers/`  | lire la requête, appeler repositories, services et presenter, choisir la réponse  | SQL, HTML, règles métier                                                     |
| Vues         | `src/views/`        | balisage Nunjucks                                                                 | calculs, conditions métier (au-delà d'un `if` sur un champ du modèle de vue) |
| HTTP         | `src/http/`         | adaptation Hono, contexte de mise en page commun, session, CSRF, cache            | règles métier                                                                |
| Adaptateurs  | `src/adapters/`     | services externes par `fetch` (OAuth, e-mail)                                     | SQL                                                                          |

Principes :
- **Injection de dépendances** : chaque contrôleur reçoit ses dépendances sous forme d'interfaces `XxxReader` / `XxxWriter` (voir `AppDeps` dans `src/app.ts`). `src/worker.ts` câble les vraies à partir des liaisons (`env.DB`, `env.FILES`…) ; les tests passent des doublures en mémoire (`tests/fixtures.ts`).
- **Pas d'accès à `env` hors du point d'entrée** : les secrets et liaisons sont lus une fois dans `worker.ts`, validés par `config.ts`, puis injectés.
- **Découpage par fonctionnalité** : un contrôleur, un presenter et une vue par page ; les repositories sont organisés par table ou agrégat.
- Les **règles de droits** vivent dans `services/permissions.ts` (ou un fichier par domaine) et ne sont jamais recopiées dans une vue ou un contrôleur.
- **Dates** : timestamps Unix (secondes) jusqu'au presenter, formatage en dernier, horloge injectée (`PageContext.clock`). Formats fixes `d/m/Y` et `H:i`, fuseau du membre.
- **Mise en page** : un contrôleur rend sa page avec `renderPage(…, 'page.njk', options, view)` ; `options` (`PageOptions`) décrit le titre, l'onglet actif et le pied.
- **Configuration du forum** : table `config` en D1, lue par `ConfigLoader` avec un cache par isolat de courte durée (30 s) ; une modification dans l'administration est donc visible partout en moins d'une minute.
- **Textes** : tous dans `src/lang/fr/` (un fichier par page), aucune chaîne en dur dans les vues ou les presenters. Gabarits d'e-mails compris.
- **URL** : adresses propres (`/sujet/4-premier-sujet`, `/forum/2-avrobb`, `/membre/3`, `/aide`…), définies **uniquement** dans `services/routes.ts`. Le code manipule des cibles logiques héritées de FluxBB (`viewtopic.php?id=4`) que `publicPath()` traduit : `url()` dans les vues, `reply.redirect()`, BBCode, e-mails, flux, plan du site. Pour un lien avec slug, `topicPath()`/`forumPath()` avec le titre **censuré**. Les pages d'action (rédaction, administration, messagerie, profil en modification) gardent leur `.php`. Tout lien est absolu (« / ») : une adresse relative casse depuis `/sujet/…`.

## Comptes et session

- **SSO uniquement** (OAuth 2 avec `state` et PKCE, appels écrits à la main avec `fetch`). Le compte est créé à la première connexion. Il n'y a ni formulaire d'inscription, ni mot de passe, ni réinitialisation.
- Un compte est identifié par le couple **(fournisseur, identifiant chez le fournisseur)**, jamais par l'adresse e-mail. Pas de fusion automatique de comptes de deux fournisseurs sur la foi de l'e-mail.
- Session : cookie `__Host-` (`Secure`, `HttpOnly`, `SameSite=Lax`) signé par HMAC (`crypto.subtle`, `SESSION_SECRET`), qui porte l'identifiant du membre, une expiration et le numéro de session du compte (`users.session_version`). Incrémenter ce numéro déconnecte le membre de partout. Aucune table de sessions, donc aucune écriture à la connexion ni purge à planifier. Le membre est relu en base à chaque requête (bannissement, groupe).
- Administrateurs initiaux désignés par configuration (`ADMIN_ACCOUNTS=github:123456`), appliquée à la création du compte.
- En développement uniquement, une connexion de test (`DEV_LOGIN=1`) permet de se connecter sans fournisseur. Elle est refusée si la requête n'est pas locale ou si l'environnement est la production.

## Cache en bordure

- Seules les réponses `GET` aux **visiteurs sans cookie de session** sont mises en cache (Cache API, `caches.default`), avec une durée courte (de l'ordre de la minute). Une réponse qui pose un cookie ou dépend du visiteur n'est jamais mise en cache.
- Un visiteur ne peut pas écrire : les pages publiques ne posent donc **aucun cookie** (ni CSRF, ni suivi de lecture), ce qui les rend cachables.
- Conséquence assumée : une page publique peut avoir une minute de retard, et le compteur de vues ne compte pas les visiteurs servis depuis le cache.

## Sécurité (non négociable)

- Échappement automatique Nunjucks ; `| safe` seulement sur du HTML produit par `parseBbcode` (sûr par construction) et commenté. Seule autre exception : le HTML saisi par l'administrateur dans les options (annonce, liens de navigation), affiché tel quel ; ces champs portent le préfixe `trustedHtml`/`…Html` dans les modèles de vue.
- Requêtes uniquement via Kysely (paramétrées) ; jamais de SQL concaténé avec des entrées utilisateur, y compris dans les expressions FTS5 (`MATCH` reçoit une chaîne échappée par `services/search.ts`).
- **Jeton CSRF** sur tout formulaire en POST (`{{ forms.csrf(layout) }}` et middleware `verifyCsrf`) ; aucune écriture en GET (exceptions documentées : présence, cookie de suivi des sujets lus, compteur de vues, conversation privée marquée lue à l'affichage).
- OAuth : `state` aléatoire lié à un cookie de courte durée, PKCE, vérification de l'URL de retour, aucun jeton du fournisseur conservé au-delà de la connexion.
- Valider et typer toutes les entrées (paramètres de requête, corps de formulaire) dès le contrôleur, avec de petites fonctions dédiées (`positiveInt`…).
- Vérifier les droits côté serveur dans le contrôleur, même quand la vue masque déjà le lien.
- Fichiers envoyés : type lu dans le contenu (`services/images.ts`), dimensions et taille plafonnées, **clé R2 générée par le serveur** (jamais dérivée du nom envoyé), `Content-Type` fixé par le serveur, `Content-Disposition` et `nosniff` sur les fichiers servis.
- En-têtes de sécurité (`http/securityHeaders.ts`) : CSP stricte, `frame-ancestors 'none'`, HSTS. Toute nouvelle origine (fournisseur OAuth, API) s'ajoute explicitement à la CSP si nécessaire.
- Secrets (`SESSION_SECRET`, identifiants OAuth, clé d'API e-mail) : `wrangler secret put` et `.dev.vars` en local (non versionné). Jamais dans `wrangler.jsonc` ni dans le dépôt.
- Limitation de débit (liaison Rate Limiting de Workers) sur la connexion, la publication et l'envoi de fichiers.

## Style de code

- Indentation par **tabulations**, apostrophes simples, points-virgules, `const` par défaut.
- **Commentaires et textes en français**, comme dans le code existant : un en-tête `/** … */` par fichier qui explique son rôle, des commentaires sur le _pourquoi_ (surtout les choix imposés par Workers ou D1), pas sur le _quoi_.
- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) : pas de `any`, pas de `!` sans justification.
- Fonctions courtes, noms explicites. Une règle reprise de FluxBB peut citer la fonction PHP d'origine (`paginate()`…) quand cela aide à comprendre.
- Tests : chaque service pur a ses tests unitaires ; chaque page a au moins un test d'intégration via `inject()` (`tests/inject.ts`, sur `app.fetch`) avec des doublures ; chaque repository a ses tests `test:db`.

## Front-end responsive

- Rendu **côté serveur** ; JavaScript uniquement en amélioration progressive (le forum doit fonctionner sans JS, envoi d'images compris : sans JS, le fichier part tel quel dans les limites de taille).
- **Mobile d'abord** : la mise en page de base est pensée pour mobile, puis élargie avec des `@media (min-width: …)`. Pas de tableaux de mise en page ; les listes de forums et de sujets passent en cartes empilées sur petit écran.
- Thèmes réduits à des **variables CSS** (couleurs) ; la structure et le responsive sont communs.
- Accessibilité : HTML sémantique, `lang`, libellés de formulaire, contraste, focus visible, cibles tactiles d'au moins 44 px.

## Skills du projet

Dans `.claude/skills/` :
- **`new-page`** : procédure pour ajouter ou refondre une page ou une fonctionnalité.
- **`mvc-review`** : grille de relecture (couches, sécurité, contraintes Workers et D1, tests) à passer avant de considérer un lot terminé.
- **`responsive-ui`** : règles CSS et gabarits pour les vues.

## Environnement

- Le dépôt est sur un disque **NTFS** : permissions forcées à 777, `chmod` sans effet. Ne pas se fier aux droits Unix.
- Langue de travail : **français**. Commits avec le trailer `Co-Authored-By` habituel, après un `npm run check` qui passe.
