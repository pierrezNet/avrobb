# TODO — AvroBB sur Cloudflare

Méthode : lots ordonnés, chacun **livrable et testé** (`npm run check` et `npm run test:db` passent à la fin de chaque lot, commit par étape cohérente). Chaque lot passe `mvc-review` avant d'être coché.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminé.

Estimations en **jours de travail effectif** (développement, tests et vérification à la main), relecture comprise.

## Pourquoi cet ordre

1. **Retirer avant de déplacer** : l'héritage PV (session FluxBB, caches PHP, SHA-1, plugins) représente une bonne part du code. Le retirer d'abord réduit tout ce qu'il faudra ensuite adapter à Hono et à D1.
2. **HTTP avant base** : passer de Fastify à Hono se fait encore sur Node et MariaDB, avec les tests existants comme filet. On ne change qu'une chose à la fois.
3. **D1 ensuite** : le plus gros lot (schéma neuf, réécriture SQL, fin des transactions). Une fois terminé, l'application tourne pour la première fois dans `wrangler dev`.
4. **R2, SSO, images, e-mails** : chacun est une brique indépendante branchée sur le Worker.
5. **Déploiement puis mise en ligne** : la chaîne de livraison est en place avant l'ouverture au public.

## Faisabilité (vérifiée sur le dépôt le 2026-10-30)

| Sujet                   | Constat                                                                                                                                                                                                                                                                                                                                                                               | Verdict                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nunjucks dans un Worker | Le seul `new Function` de Nunjucks est dans `Environment._compile`, appelé uniquement quand un gabarit n'est pas précompilé. `PrecompiledLoader` fournit l'objet déjà compilé. 83 vues et 10 partiels (406 Ko de source, 260 `include`/`import`/`extends`), résolus par nom à l'exécution.                                                                                            | **OK** : précompiler au build vers un module ES (option `wrapper` de `precompile`), importer le runtime sans les chargeurs de fichiers. À valider par un essai au lot 2 (taille du module, rendu identique). |
| Kysely + D1             | Kysely fournit le dialecte SQLite (adaptateur, compilateur) ; il manque un pilote D1 (~60 lignes, pas de dépendance). **D1 refuse les transactions interactives** : `inTransaction()` est utilisé **34 fois dans 13 repositories**, et `.forUpdate()` 1 fois. Il y a 15 `sql` bruts (dont `ALTER TABLE` pour PunBalise, `AUTO_INCREMENT`), 1 `onDuplicateKeyUpdate` et 10 `insertId`. | **OK, avec réécriture** : `db.batch()` atomique, `RETURNING`, sous-requêtes, `INSERT … ON CONFLICT`. C'est le cœur du lot 3.                                                                                 |
| Multipart               | `http/forms.ts` lit déjà le multipart avec `Request.formData()` (API Web), et seulement 5 usages de `request.uploads`.                                                                                                                                                                                                                                                                | **OK** : natif dans Workers. Abaisser la limite d'envoi (16 Mo → ~5 Mo) à cause des 128 Mo de mémoire.                                                                                                       |
| Ressources statiques    | `public/` pèse 156 Ko (CSS, 7 scripts, icônes). Les empreintes sont calculées à l'exécution avec `fs.readFileSync`.                                                                                                                                                                                                                                                                   | **OK** : Workers Static Assets (gratuit, sans invocation du Worker), empreintes calculées au build.                                                                                                          |
| API Node                | `node:crypto` (8 fichiers), `node:fs`/`path` (13, tous liés aux fichiers PHP ou locaux), `node:dns` et `node:os` (1 chacun), `Buffer` (20).                                                                                                                                                                                                                                           | **OK** : `nodejs_compat` couvre `crypto` et `Buffer`.`fs`, `dns` et `os` disparaissent avec l'héritage PV ou R2.                                                                                             |
| Couplage à Fastify      | 61 fichiers importent `fastify`, mais les contrôleurs n'utilisent que `query`, `body`, `viewer`, `board`, `url`, `ip`, `cookies`, `headers`, `uploads` et `redirect`/`code`/`type`/`send`.                                                                                                                                                                                            | **OK** : un contexte de requête maison et un adaptateur Hono évitent de réécrire 51 contrôleurs en profondeur.                                                                                               |
| CPU                     | 10 ms par requête sur l'offre gratuite : un sujet de 25 messages (BBCode + Nunjucks) risque de dépasser.                                                                                                                                                                                                                                                                              | **Workers Paid (5 $/mois)** : 30 s de CPU, 10 Mo de bundle, D1 et R2 largement suffisants. Le cache en bordure absorbe les visiteurs.                                                                        |
| Mémoire, bundle         | 128 Mo par isolat ; bundle à 10 Mo compressé sur Paid (Nunjucks ~150 Ko, Kysely ~200 Ko, Hono ~20 Ko, gabarits compilés estimés à 1–2 Mo).                                                                                                                                                                                                                                            | **OK** : à mesurer au lot 3 (`wrangler deploy --dry-run --outdir`).                                                                                                                                          |
| Recherche               | Index maison `search_words`/`search_matches` comme FluxBB, avec mots vides lus dans les fichiers PHP.                                                                                                                                                                                                                                                                                 | **Remplacé** par FTS5 (pris en charge par D1). Attention : `wrangler d1 export` ne sait pas exporter les tables virtuelles (voir lot 7, sauvegardes).                                                        |

Budget : Workers Paid à 5 $/mois (~4,60 €) inclut 10 M de requêtes, 25 G de lignes lues et 50 M de lignes écrites en D1 par mois, et 5 Go de stockage D1. R2 est gratuit jusqu'à 10 Go, sans frais de sortie. Resend est gratuit jusqu'à 3 000 e-mails par mois. Total attendu : **5 $/mois**, nom de domaine en plus. Chiffres à revérifier au lot 7.

---

## Lot 1 — Retrait de l'héritage PV · 2 à 3 jours · terminé le 2026-10-30

Le code tourne encore sur Fastify et MariaDB (base locale, plus partagée avec personne). On retire, on ne déplace pas.

- [x] Cohabitation PHP : `LEGACY_BASE_URL`, `LEGACY_ROOT`, `PORTED_PAGES` et les redirections vers le PHP des cas non portés ; fichiers dans un stockage local (`STORAGE_DIR`, servi sous `/img/`) en attendant R2
- [x] Caches PHP : `PhpCacheFiles`, `phpVarExport`, invalidations dans l'administration ; réglages et statistiques des membres en cache mémoire court ; « Vider les caches » retiré de la Maintenance
- [x] Session FluxBB remplacée par un **cookie signé** (HMAC-SHA256, `SESSION_SECRET`), avec une **connexion de développement** (`DEV_LOGIN=1`, depuis la machine seulement) ; déconnexion en POST
- [x] Mots de passe et comptes locaux : SHA-1, connexion par formulaire, inscription, mot de passe oublié, changement de mot de passe et d'adresse par lien, ajout de membre par l'administration ; l'adresse se modifie directement dans le profil
- [x] Modèles d'e-mails et mots vides de la recherche dans `src/lang/fr/`
- [x] Plugins PV : PunBalise, Plugile (biographie et Suivile compris), Uploadile et le gestionnaire de fichiers ; section « Administration » du profil retirée (admin_users.php la remplace)
- [x] Messagerie privée simplifiée : conversations gardées ; contacts, listes d'envoi et blocage d'expéditeur retirés. La page d'administration est **gardée** (activation, notifications, droits par groupe)
- [x] Spécificités PV restantes : « simulateurs » devenus « projets » (balises du sujet, activité de la semaine), barre d'outils fixée dans le code avec ses propres icônes SVG, statistiques serveur (`node:os`) retirées
- [x] Outils de parité retirés ; les cas de `tests/bbcode/` restent comme instantanés figés
- [x] `package.json`, `README.md`, `.env.example`, skills (`new-page` remplace `port-page`), textes des pages d'information pour AvroBB
- [x] Identité visuelle : logo, bannière (d'après pierrez.net), favicons, manifeste ; générateur `scripts/brand.py`

Reporté :
- `hostResolver` (DNS inverse de la consultation d'IP) : l'interface reste, l'adaptateur passera en DNS sur HTTPS au lot 3.
- `AdminStatsRepository` (`SHOW TABLE STATUS`) : à réécrire pour D1 au lot 3.
- Colonnes et tables FluxBB devenues inutiles (`password`, `activate_*`, `balises*`, `contacts`, `sending_lists`, `toolbar_*`, `upload`, `biographie`…) : absentes du schéma neuf du lot 3.

Vigilance :
- Retirer **avec les tests** : supprimer les tests des fonctions retirées, pas les affaiblir. Le nombre de tests baisse, la couverture de ce qui reste ne doit pas baisser.
- `phpSerialize` sert encore à lire la liste des modérateurs d'un forum (`forums.moderators`) : le garder jusqu'au lot 3, où cette colonne devient une table de liaison.
- `legacySession` est importé par 48 fichiers (surtout des tests) : introduire d'abord la nouvelle session derrière la même interface, puis supprimer l'ancienne.
- Le schéma MariaDB ne change pas encore : des tables deviennent inutilisées, elles disparaîtront au lot 3.

## Lot 2 — Couche HTTP Hono · 3 à 4 jours · terminé le 2026-10-30

Toujours sur Node et MariaDB (`@hono/node-server` provisoire), mais avec le code qui tournera dans le Worker.

- [x] Contexte de requête maison (`src/http/context.ts`) : `AppRequest` (`query`, `body`, `uploads`, `viewer`, `board`, `ip`, `cookies`…) et `AppReply` (`code`, `redirect`, `setCookie`, `json`…), de la même forme que ce que les contrôleurs utilisaient de Fastify ; `http/server.ts` en fait une `Response`
- [x] Contrôleurs basculés vers ce contexte (types seulement)
- [x] Hono (`http/server.ts`) : routes avec étapes préalables (session, CSRF), lecture des formulaires (urlencoded et multipart, limites 1 Mio et 16 Mio, 413/415), erreurs, page 404, en-têtes de sécurité sur toutes les réponses, fichiers statiques
- [x] **Gabarits précompilés** : `scripts/build-templates.mjs` → `src/generated/templates.js` (non versionné), runtime `nunjucks-slim` avec `PrecompiledLoader`, `throwOnUndefined` actif ; `npm run dev` les recompile à chaque modification
- [x] Ressources et fichiers derrière des dépendances injectées (`assetUrl`, `assets`, `images`) : adaptateurs Node (`adapters/assetUrls.ts`, `adapters/directoryFiles.ts`) en attendant le manifeste de build et Static Assets (lot 3), puis R2 (lot 4)
- [x] Tests : utilitaire `tests/inject.ts` (même forme de réponse que `app.inject()` de Fastify), sur `app.fetch`
- [x] Retrait de `fastify` et `@fastify/*` ; `app.ts` et `http/` n'importent plus rien de Node
- [x] Rendu comparé avant et après sur 56 pages (28 adresses, en invité et en membre) : identique

Reporté :
- Manifeste des ressources (`src/generated/assets.json`) : avec le Worker, au lot 3 (l'adaptateur Node le remplace d'ici là).
- Paramètres de requête : les types restent déclaratifs, comme sous Fastify (valeurs validées dans les contrôleurs par `positiveInt` et consorts). Des lecteurs validés par route restent souhaitables.

## Lot 3 — D1 : schéma SQLite neuf et migrations · 6 à 8 jours · terminé le 2026-10-30

Changement de découpage : la base passe sur D1 **sous Node** (base locale de Wrangler, par `getPlatformProxy`), sans changer le reste (serveur, sharp, fichiers sur disque). Le Worker et `wrangler dev` arrivent au lot 4 avec R2, qui supprime la dépendance au disque. MariaDB et `mysql2` disparaissent.

- [x] `wrangler.jsonc` (liaison `DB`, migrations), base locale dans `.wrangler/state` ; `server.ts` l'ouvre par `getPlatformProxy`
- [x] Pilote Kysely pour D1 (`src/db/d1Dialect.ts`, types minimaux dans `src/db/d1.ts`) et `db.batch()` : requêtes Kysely compilées et envoyées en un seul lot atomique
- [x] **Schéma neuf** (`migrations/0001_initial.sql`) : noms de FluxBB gardés sans préfixe (repositories lisibles), colonnes et tables mortes retirées, `users.provider`/`provider_id`/`session_version` ajoutés, pseudos en `COLLATE NOCASE`, identifiants `AUTOINCREMENT` ; modérateurs d'un forum en JSON (`services/moderators.ts`) au lieu du format PHP
- [x] Données de départ (`migrations/0002_default_data.sql`) : groupes, compte « Invité », réglages par défaut d'AvroBB ; `scripts/dev-seed.sql` pour la base locale (administrateur « Emmanuel », catégorie et deux forums)
- [x] Recherche : l'index de mots de FluxBB est **gardé** (SQL standard, exportable ; FTS5 reste une option)
- [x] **Repositories** : les 34 transactions remplacées par des lots atomiques. Lectures d'abord, écritures ensuite ; identifiants créés désignés dans le lot par sous-requête (`LAST_POST_ID`, `LAST_TOPIC_ID`…, sûr car un lot est une transaction et l'AUTOINCREMENT croît) ; compteurs (`update_forum()`, sujet recompté) en sous-requêtes ; numéro de conversation de la messagerie calculé dans le lot (remplace le verrou `FOR UPDATE`) ; `ON CONFLICT` et `INSERT OR IGNORE` ; `LIKE … ESCAPE '\'` (SQLite n'a pas d'échappement par défaut)
- [x] `test:db` sur une D1 locale neuve à chaque lancement ; `inRollback()` remet la base dans son état de départ après chaque test
- [x] Statistiques de la base sur D1 (lignes par table, taille par la métadonnée `size_after` : `PRAGMA page_count` est refusé)
- [x] Retrait de `mysql2`, `TablePrefixPlugin`, du schéma MariaDB de test

Reporté :
- Tâche planifiée (Cron Trigger) de purge de `online` et des brouillons anciens : avec le Worker (lot 4).
- Données de développement : la base locale part de `dev-seed.sql` ; rien n'est importé de MariaDB (contenu jetable).

Vigilance :
- **Transactions** : pour chaque `inTransaction()`, écrire ce qui doit rester cohérent (compteurs `num_posts`/`num_replies`/`last_post*`) et vérifier que le lot atomique le garantit **sans lecture intermédiaire**. Les compteurs se mettent à jour de façon relative (`num_replies = num_replies + 1`) ou se recalculent par sous-requête. `forUpdate()` (messagerie) devient une condition dans le `UPDATE … WHERE`.
- Pas de `last_insert_rowid()` entre deux requêtes d'un lot pour l'instant : préférer un identifiant connu d'avance ou une sous-requête sur une colonne unique. Cas typique : nouveau sujet + premier message.
- Collation : SQLite compare en binaire. Les recherches de pseudo insensibles à la casse se font avec `COLLATE NOCASE` (ASCII seulement) ou une colonne normalisée (`username_key`, en minuscules et sans accents).
- Dates : entiers Unix comme aujourd'hui, pas de `DATETIME` SQLite.
- **Coût en lignes** : chaque index ajouté rend les écritures plus chères, et `COUNT(*)` sur une grande table lit toutes les lignes. Garder les compteurs dénormalisés de FluxBB.
- Limites D1 : 100 paramètres liés par requête (attention aux `IN (…)` longs, à découper) et 100 Ko par instruction SQL.
- Pas d'import des données de Pilote-Virtuel : AvroBB démarre vide.

## Lot 4 — Worker et R2 · 3 à 4 jours

Le forum tourne dans `wrangler dev`, puis le serveur Node disparaît.

- [ ] `src/worker.ts` : câblage des dépendances à partir de `env` (`DB`, `FILES`, `ASSETS`, secrets), `nodejs_compat` ; `npm run dev` = `wrangler dev`
- [ ] Ressources statiques par Workers Static Assets (`public/` servi tel quel sous `/assets/`) et **manifeste des empreintes** calculé au build (`src/generated/assets.json`, à la place d'`adapters/assetUrls.ts`)
- [ ] Ce qui dépendait de Node : consultation d'IP par DNS sur HTTPS (`fetch`, à la place de `node:dns`), e-mails journalisés en attendant le lot 6 (`nodemailer` retiré), **images sans sharp** : type, dimensions et poids lus dans le contenu et vérifiés, fichier gardé tel quel (la conversion en WebP dans le navigateur arrive au lot 6)
- [ ] Tâche planifiée (Cron Trigger) : purge de `online` et des brouillons anciens
- [ ] Liaison `FILES` (bucket `avrobb-files`), interface `FileStore` (`put`, `get`, `delete`) et doublure en mémoire pour les tests
- [ ] Galerie, avatars, logo et bannière (`GalleryFiles`, `avatars.ts`, `HeaderImageFiles`) passés sur R2 ; clés générées par le serveur (`gallery/<id>-<aléa>.webp`)
- [ ] Route `GET /files/*` : lecture R2, `Content-Type` fixé par le serveur, `ETag`, `Cache-Control: public, max-age=31536000, immutable` (une clé ne change jamais de contenu), cache en bordure
- [ ] Images du forum (galerie, avatars) insérées dans les messages en **adresse relative** (`/img/gallery/…`) et non plus préfixées d'`o_base_url` : une adresse absolue casse dès que le domaine change (développement → production). Le rendu (variante mobile, `<picture>`, miniatures de l'accueil) reconnaît aussi les anciennes adresses absolues du forum
- [ ] Suppression : effacement R2 **après** la suppression en base (un fichier orphelin vaut mieux qu'une ligne qui pointe dans le vide) ; tâche planifiée de nettoyage des orphelins

Vigilance :
- Même origine que le forum : la CSP `img-src 'self'` suffit, et le domaine public `r2.dev` reste désactivé.
- Taille max par fichier et quota par membre (nombre d'images), à vérifier avant l'écriture.

## Lot 5 — SSO (GitHub, Google en option) · 2 à 3 jours

- [ ] Adaptateur OAuth générique (`src/adapters/oauth.ts`) : URL d'autorisation, échange du code, lecture du profil ; GitHub d'abord (`read:user`, `user:email` facultatif), Google ensuite (OpenID Connect, `openid profile`)
- [ ] `state` + PKCE dans un cookie de courte durée, URL de retour fixe par fournisseur
- [ ] Création du compte à la première connexion : pseudo proposé depuis le fournisseur, rendu unique (suffixe), modifiable une fois dans le profil ; avatar du fournisseur **non** recopié automatiquement
- [ ] Page de connexion « Se connecter avec GitHub / Google » (sans JS), déconnexion en POST, « Me déconnecter de partout » (incrémente `session_version`)
- [ ] Administrateurs initiaux par `ADMIN_ACCOUNTS`
- [ ] Suppression de son compte par le membre (messages conservés sous « Membre supprimé »), exigée par la politique de confidentialité
- [ ] Retrait de `DEV_LOGIN` en production (test qui le garantit)

Vigilance :
- Identifier par `(provider, provider_id)`, jamais par e-mail ; un e-mail fourni par GitHub peut être absent ou non vérifié.
- Un membre banni qui se reconnecte reste banni (bannissement porté par le compte, pas par la session).
- Limitation de débit sur `/auth/*`.
- Mettre à jour la politique de confidentialité : données reçues du fournisseur et durée de conservation.

## Lot 6 — Images et e-mails · 2 à 3 jours

- [ ] **Images côté navigateur** : script d'amélioration progressive qui redimensionne (1024 px, plus une variante 640 px) et convertit en WebP par `canvas` avant l'envoi ; recadrage de l'avatar ; repris de ce que fait déjà la vignette de galerie
- [ ] Côté serveur, sans sharp : type lu dans le contenu, **dimensions lues dans l'en-tête** (WebP, PNG, JPEG, GIF) par une fonction pure, refus au-delà des limites ; sans JS, le fichier d'origine est accepté tel quel s'il respecte taille (~2 Mo) et dimensions
- [ ] Retrait de `sharp` et de `SharpImageProcessor`
- [ ] **E-mails** : `Mailer` par API HTTP (Resend, comme donnetonpoint), `NullMailer` par défaut tant que la clé n'est pas configurée ; notifications d'abonnement et alertes de message privé ; retrait de `nodemailer` et de `MAIL_OUTBOX`
- [ ] Envoi des e-mails hors du chemin de la réponse (`ctx.waitUntil`) pour ne pas ralentir la publication

Vigilance :
- L'orientation EXIF des photos de téléphone : `createImageBitmap(file, { imageOrientation: 'from-image' })` avant de dessiner.
- Les navigateurs sans encodeur WebP (anciens Safari) renvoient du PNG avec `toBlob('image/webp')` : vérifier le type obtenu et repasser en JPEG si besoin.
- E-mail : domaine d'envoi vérifié (SPF, DKIM) chez le fournisseur ; lien de désabonnement dans chaque notification.
- Option à garder en tête : Cloudflare Images (redimensionnement à la volée, 5 000 transformations gratuites par mois) si le traitement côté navigateur ne suffit pas.

## Lot 6 bis — URL propres · 1 à 2 jours

Décidé : à faire une fois toutes les pages stabilisées (SSO compris) et avant la mise en ligne, tant qu'aucun lien externe ni moteur de recherche ne connaît les anciennes adresses.

- [ ] Schéma d'adresses en français et sans extension : `/`, `/forum/2`, `/sujet/4`, `/sujet/4/page/2`, `/message/123` (redirige vers le message dans son sujet), `/membre/3`, `/recherche`, `/galerie`, `/messages`…
- [ ] Une seule source des adresses (`services/routes.ts` : fonctions `topicUrl(id, page)`…) utilisée par les presenters, les vues (`url()`), le plan du site et les e-mails ; plus aucune chaîne `viewtopic.php?…` en dur
- [ ] Anciennes adresses (`viewtopic.php?id=4`…) : redirection 301 vers les nouvelles, pour les liens déjà présents dans les messages
- [ ] Mise à jour de `robots.txt`, `sitemap.xml`, des URL canoniques, de la CSP si besoin, et des tests

Vigilance :
- Les messages contiennent des liens internes en BBCode (`[url]…viewtopic.php?pid=…[/url]`, mentions `profile.php?id=…`) : les redirections 301 les gardent valides, sans réécrire les messages.
- Les formulaires POST gardent des adresses stables ; ne pas rediriger un POST (307/308 si nécessaire).

## Lot 7 — Déploiement : Wrangler, GitHub Actions, domaine, cache · 2 jours

- [ ] Ressources Cloudflare : base D1 (région Europe), bucket R2, Worker, secrets (`SESSION_SECRET`, identifiants OAuth, clé Resend)
- [ ] GitHub Actions : `npm run check` et `test:db` sur chaque push et PR ; sur `main`, `wrangler d1 migrations apply --remote` puis `wrangler deploy` (jeton d'API limité au compte et aux ressources du projet, en secret du dépôt)
- [ ] Domaine personnalisé sur le Worker, HTTPS, HSTS
- [ ] **Cache en bordure** : middleware Cache API pour les `GET` sans cookie de session, durée courte (60 s), en-tête `Cache-Control` adapté ; aucune réponse avec `Set-Cookie` mise en cache ; vérifier qu'aucune page publique ne pose de cookie
- [ ] Observabilité : journaux Workers activés, alerte en cas d'erreurs, mesure du CPU par page
- [ ] Sauvegardes : D1 Time Travel (30 jours sur Paid) ; export hebdomadaire par une Action (`wrangler d1 export`, sans la table FTS5, recréée à la restauration) vers un artefact privé ou R2
- [ ] Limitation de débit (liaison Rate Limiting) sur connexion, publication, envoi de fichiers et recherche

Vigilance :
- Le jeton Cloudflare de la CI ne doit pas pouvoir toucher d'autres zones ou comptes.
- Une migration D1 appliquée avant le déploiement doit rester compatible avec la version précédente du code (ajouter, puis retirer dans un déploiement suivant).
- Purge du cache : la durée courte évite d'avoir à purger ; ne pas monter au-delà de quelques minutes sans mécanisme de purge.

## Lot 8 — Mise en ligne · 1 jour, plus la relecture des textes

- [ ] Pages d'information relues et complétées : responsable du traitement, hébergeur (Cloudflare), mentions légales, politique de confidentialité (SSO, cookies, journaux)
- [ ] `robots.txt`, `sitemap.xml`, URL canoniques sur le domaine final
- [ ] Revue de sécurité (`/security-review`) et passage de `FAILLES_PHP.md` comme liste de contrôle
- [ ] Contrôle à la main, sur mobile et bureau, avec et sans JS : lecture anonyme (servie par le cache), connexion GitHub, publication, édition, galerie, messagerie, modération, administration
- [ ] Mesures : CPU par page, lignes D1 lues par page, poids des pages
- [ ] Catégories et forums de départ créés, premier message publié
- [ ] `AMELIORATIONS.md` mis à jour

---

## À décider

- [ ] **Éditeur WYSIWYG** (SCEditor, mode source BBCode) : repris de la TODO de pv-forum, après la mise en ligne (2 à 3 jours).
- [ ] Réputation : utile sur un forum personnel ? Gardée pour l'instant.
- [ ] Biographie du membre (retirée avec Plugile) : la remettre comme champ de la section Personnalité du profil ?
- [ ] Thème aux couleurs d'AvroBB (bordeaux et or du logo) comme thème par défaut, à la place d'Air (bleu), qui jure avec la bannière.
- [ ] Notifications sur le site (page « Notifications ») à la place des messages privés pour les mentions, si la messagerie se révèle inutile.

## Estimation globale

| Lot                         | Durée             |
| --------------------------- | ----------------- |
| 1. Retrait de l'héritage PV | 2–3 j             |
| 2. Couche HTTP Hono         | 3–4 j             |
| 3. D1                       | 6–8 j             |
| 4. Worker et R2             | 3–4 j             |
| 5. SSO                      | 2–3 j             |
| 6. Images et e-mails        | 2–3 j             |
| 6 bis. URL propres          | 1–2 j             |
| 7. Déploiement              | 2 j               |
| 8. Mise en ligne            | 1 j + textes      |
| **Total**                   | **22 à 30 jours** |
