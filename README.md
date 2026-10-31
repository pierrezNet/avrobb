# AvroBB

Forum personnel d'Emmanuel Pierrez, lieu d'échange autour de ses projets. Lecture publique, écriture
réservée aux membres, comptes par SSO (GitHub, Google en option).

Le code vient de **pv-forum**, réécriture Node.js/TypeScript du forum Pilote-Virtuel (FluxBB 1.5.4),
dont AvroBB est désormais indépendant : plus de cohabitation avec un PHP ni de compatibilité de
schéma FluxBB. Cible : **Cloudflare** (Workers, D1, R2). Le plan de portage est dans
[`TODO.md`](TODO.md), les règles de travail dans [`CLAUDE.md`](CLAUDE.md).

## État actuel

Lots 1 à 7 terminés côté code (retrait de l'héritage PV, Hono et gabarits précompilés, base D1,
Worker et R2, connexion SSO, images et e-mails, URL propres, cache en bordure et déploiement
automatique) ; la mise en production suit la section « Déploiement ». L'application est un **Worker Cloudflare** (`src/worker.ts`), lancé en local par
`wrangler dev` avec D1 et R2 locaux (`.wrangler/state`). Comptes par **GitHub** (Google en option) :
créer une application OAuth (URL de retour `http://localhost:8787/auth/github/callback`) et
renseigner `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` et `ADMIN_ACCOUNTS` dans `.dev.vars`. La
**connexion de développement** (`DEV_LOGIN=1`) reste disponible depuis la machine, jamais en
production. Les e-mails sont seulement notés dans le journal jusqu'au lot 6.

## Lancer

```bash
cp .dev.vars.example .dev.vars   # SESSION_SECRET : openssl rand -hex 32
npm install
npm run db:migrate      # crée la base D1 locale (.wrangler/state) : schéma et réglages par défaut
npm run db:seed:dev     # administrateur « Emmanuel » (connexion de développement), catégorie et forums
npm run dev             # wrangler dev, http://localhost:8787 ; gabarits et manifeste recalculés à chaque modification
npm run check           # lint (Biome) + typecheck + tests rapides
npm run test:db         # tests sur D1 et R2 locaux neufs (migrations + tests/db/seed.sql)
npm run screenshot -- 'http://localhost:8787/' --widths 320,1280 [--cookie avrobb_session=…]
```

Base : D1 (SQLite), schéma dans `migrations/`. La base locale de `wrangler dev` est rangée sous
l'identifiant `database_id` de `wrangler.jsonc` (`.wrangler/state/v3/d1/`) : le changer fait partir
`wrangler dev` sur une base vide (l'ancienne reste dans son fichier, à recopier avec l'API de
sauvegarde de SQLite). Les écritures en plusieurs requêtes passent par
des lots atomiques (`db.batch()`, voir `src/db/database.ts`) : D1 n'a pas de transaction interactive.
Les captures demandent un Chrome sans tête (`CHROME_BIN`, ou celui de Playwright s'il est installé).

Ressources statiques (CSS, scripts, icônes) : `public/assets/`, servies sous `/assets/` par Workers
Static Assets sans appeler le Worker (en-têtes dans `public/_headers`) ; leur empreinte (`?v=…`) vient
du manifeste calculé par `npm run build` (`src/generated/assets.js`).

Fichiers envoyés (galerie, avatars, logo, bannière) : bucket R2 `avrobb-files` (liaison `FILES`),
servi par le Worker sous `/img/` avec ETag et cache en bordure d'une heure. Tant qu'aucun logo ni
bannière n'a été envoyé, l'en-tête affiche ceux d'AvroBB (`public/assets/img/`, régénérés par
`scripts/brand.py`). Une tâche planifiée nocturne (`triggers` de `wrangler.jsonc`) purge la table
`online` et efface les fichiers orphelins ; en local : `curl 'http://localhost:8787/cdn-cgi/handler/scheduled'`.

## Déploiement

Une fois pour toutes (compte Cloudflare sur l'offre **Workers Paid**, `npx wrangler login`) :

1. Base et fichiers : `npx wrangler d1 create avrobb --location weur` (copier l'identifiant dans
   `wrangler.jsonc`, `database_id`), `npx wrangler r2 bucket create avrobb-files`,
   `npx wrangler r2 bucket create avrobb-backups` (sauvegardes, privé).
2. Schéma : `npm run db:migrate:remote`.
3. Secrets : `npx wrangler secret put` pour `SESSION_SECRET` (`openssl rand -hex 32`),
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `ADMIN_ACCOUNTS` (`github:…,google:…`), `RESEND_API_KEY`, `MAIL_FROM`.
4. Domaine : `avrobb.org`, acheté chez Cloudflare Registrar, déclaré dans `routes` de
   `wrangler.jsonc` (domaine personnalisé du Worker : DNS et certificat créés au déploiement).
5. Premier déploiement : `npm run deploy`, puis l'adresse du forum dans la base :
   `npx wrangler d1 execute avrobb --remote --command "UPDATE config SET conf_value = 'https://avrobb.org' WHERE conf_name = 'o_base_url'"`.
6. Applications OAuth de production (GitHub : nouvelle application ; Google : ajouter l'URI) avec
   l'adresse de retour `https://<domaine>/auth/github/callback` (et `/auth/google/callback`).
7. GitHub : secrets `CLOUDFLARE_API_TOKEN` (jeton limité au compte : Workers Scripts, D1, Workers R2
   Storage, en écriture) et `CLOUDFLARE_ACCOUNT_ID` dans l'environnement `production` du dépôt.

Ensuite, chaque envoi sur `main` passe `npm run check` et `npm run test:db`, applique les
migrations à la base distante puis déploie (`.github/workflows/ci.yml`). Une migration doit rester
compatible avec la version en ligne : ajouter une colonne, puis ne la retirer que plus tard.

**Sauvegardes** : D1 Time Travel (retour à n'importe quelle minute des 30 derniers jours,
`npx wrangler d1 time-travel restore avrobb --timestamp …`) et export hebdomadaire compressé dans le
bucket `avrobb-backups` (`.github/workflows/backup.yml`). Restaurer un export : le décompresser puis
`npx wrangler d1 execute avrobb --remote --file avrobb-AAAA-MM-JJ.sql` sur une base vide.

**Suivi** : journaux et métriques dans le tableau de bord Cloudflare (Workers → avrobb →
Observabilité), ou `npx wrangler tail`. Une page doit rester sous ~50 ms de CPU.

**Cache en bordure** : les pages vues sans aucun cookie du forum sont gardées 60 s en bordure
(`src/http/edgeCache.ts`), les fichiers envoyés une heure. Un invité ne reçoit de cookie que sur les
pages de formulaire (connexion). Les cookies prennent le préfixe `__Host-` en HTTPS.

## Organisation

| Couche       | Dossier                            | Rôle                                                                        |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------- |
| Modèle       | `src/domain/`, `src/repositories/` | Objets du domaine ; seul endroit où l'on écrit du SQL (Kysely, typé)        |
| Services     | `src/services/`                    | Règles pures et testables : permissions, BBCode, dates, pagination, session |
| Présentation | `src/presenters/`                  | Domaine → modèle de vue (fonction pure)                                     |
| Contrôleur   | `src/controllers/`                 | Requête → repositories → presenter → réponse ; ni SQL ni HTML               |
| HTTP         | `src/http/`                        | Hono, contexte de requête, session, CSRF, formulaires, mise en page         |
| Vue          | `src/views/`                       | Nunjucks, précompilé dans `src/generated/` ; échappement automatique        |

Les tables gardent les noms de FluxBB 1.5, sans préfixe.

Front-end : `public/assets/css/base.css` (mobile d'abord) et un fichier de variables par thème dans
`public/assets/css/themes/` ; le contraste AA de chaque thème est vérifié par `tests/themes.test.ts`.

## Différences avec FluxBB

- BBCode : écarts volontaires listés en tête de `src/services/bbcode.ts` (émojis au lieu des images,
  `[video]` en lecteur intégré, `[spoiler]` en `<details>`, liens `[topic]`… corrigés, balises
  déséquilibrées laissées en texte). Le reste est comparé aux sorties du parseur PHP relevées une
  fois pour toutes (`tests/bbcode/`, instantanés figés).
- Affichage des messages : adresses en texte brut (`http://…`, `www.…`) transformées en liens, y
  compris dans les anciens messages (PV avait désactivé ce [url] de `do_clickable()`) ; un retour à
  la ligne simple est suivi d'un demi-interligne d'espace (`<span class="bbcode-gap">`).
- Menu : liens « Galerie » et « Brouillons » ajoutés après « Profil », comme le menu burger de PV
  (à retirer de `o_additional_navlinks` s'ils y figurent en production).
- Renommée : la condition PHP sur `reputation_enable_adm` (colonne absente du schéma local) est ignorée.
  Table `reputation` absente de la base locale, reconstituée d'après `reputation.php`. Le vote vise
  un message par son numéro, lisible par le votant (le PHP recherchait aussi l'auteur par un pseudo
  reçu d'un champ caché et inséré tel quel dans sa requête SQL) ; le seuil de messages porte sur le
  sens du vote (le PHP exigeait les deux seuils) ; erreurs réaffichées dans le formulaire ; plus
  d'e-mail codé en dur à la suppression de votes ; pagination sans page vide en trop.
- Site web du profil : préfixé de `http://` s'il n'a pas de schéma (le PHP laissait passer `javascript:`).
- Textes en français seulement.
- Liens de modération du pied de page affichés : PV les masque visuellement (`sr-only`) sans autre accès.
  Fermer et épingler passent par un bouton POST avec jeton CSRF (le PHP écrivait sur un lien GET,
  vérifié par le seul Referer) ; un ancien lien GET mène à une confirmation.
- Modération (`moderate.php`) : toutes les actions en POST avec jeton CSRF ; le premier message
  d'un sujet n'est jamais supprimé ni scindé, même par une requête forgée ; un modérateur ne peut
  pas supprimer un sujet ou un message où un administrateur a écrit ; les erreurs s'affichent dans
  la page ; « Laisser un lien de redirection » proposé coché pour un sujet seul, comme le PHP.
  Consultation d'IP : résolution inverse limitée à 2 secondes.
- Retours de l'application Phraséo (absent de FluxBB) : le relais de Phraséo crée un sujet dans le
  forum privé « Retours Phraséo (à trier) » par liaison de service (`PhraseoFeedback`, aucune adresse
  publique), signé d'un compte système sans connexion possible ; le contact de l'auteur part par
  e-mail à la liste de diffusion, jamais dans le sujet. Un administrateur publie un retour par le
  bouton « Accepter » (`phraseo_accept.php`, POST avec jeton CSRF) : rappel d'en-tête remplacé, sujet
  déplacé vers le forum de l'option « Forum des retours Phraséo acceptés » (n° 4 par défaut).
- Signalements (`admin_reports.php`) : bouton « Marquer comme traité » en POST avec jeton CSRF ;
  les 10 derniers signalements traités sont conservés, comme le PHP.
- Accueil de l'administration : pas de vérification de mise à jour (`action=check_upgrade`, le
  service de fluxbb.org n'existe plus). Statistiques : membres en ligne pour tous, base de données
  pour les administrateurs ; ni charge du serveur, ni environnement, ni `phpinfo()`.
- Options (`admin_options.php`) : erreurs de saisie réaffichées dans le formulaire (toutes à la fois,
  le PHP s'arrêtait à la première) ; mot de passe SMTP jamais renvoyé au navigateur (le PHP y mettait
  une valeur factice) ; fuseau, langue et style limités aux listes proposées ; une URL de base au
  domaine accentué passe en punycode par l'analyseur d'URL de Node. Formats de date et d'heure
  enregistrés mais sans effet sur l'affichage (PV utilise des formats fixes).
- Catégories et forums (`admin_categories.php`, `admin_forums.php`) : erreurs réaffichées dans la
  page ; la suppression d'un forum se confirme par un bouton POST (le lien GET n'affiche que la
  confirmation) ; enregistrer un forum qui contient des sujets conserve son URL de redirection (le
  PHP la vidait, le champ n'étant pas envoyé) ; une permission qui diffère du groupe est signalée
  « (modifié) » au lieu de la seule couleur.
- Liens de projet (AvroBB) : chaque forum peut avoir un « Site du projet » et un « Dépôt » (colonnes
  `forums.site_url` et `repo_url`, migration 0003), adresses http(s) uniquement, affichés en
  pastilles sur l'index et en tête du forum.
- Groupes (`admin_groups.php`) : erreurs réaffichées dans le formulaire ; la suppression ne se fait
  qu'en POST (le lien affiche la confirmation ou le choix du groupe d'accueil) ; les membres ne
  peuvent pas être déplacés vers les invités ; les valeurs oui/non sont enregistrées en 0/1 (le PHP
  gardait l'entier reçu). Les colonnes propres à PV (messagerie, renommée) gardent leurs valeurs par
  défaut à la création, comme avec le PHP.
- Utilisateurs (`admin_users.php`) : résultats en cartes ; dates de recherche aux formats
  aaaa-mm-jj ou jj-mm-aaaa (avec heure facultative), là où `strtotime()` acceptait aussi des formes
  libres (« yesterday ») ; date d'expiration d'un bannissement au format aaaa-mm-jj seulement ; pas de
  lien JavaScript « Tout sélectionner ». Changer de groupe, supprimer et bannir passent par les mêmes
  étapes de confirmation que le PHP, avec jeton CSRF.
- Pages servies par `admin_loader.php?plugin=…` (mêmes URL que le PHP) : AvroBB n'a pas de
  système de plugins, elles figurent dans le menu d'administration comme les autres pages (plus de
  « Menu des plugins ») : Balises (balises du sujet) et Messagerie privée. Un ancien plugin
  abandonné renvoie une erreur 400.
- Bannissements (`admin_bans.php`) : suppression par bouton POST après confirmation (le PHP
  supprimait sur un lien GET) ; erreurs réaffichées dans le formulaire ; un octet « 000 » d'une IP
  devient « 0 » (le PHP le vidait) ; dates de recherche aux formats proposés (aaaa-mm-jj).
  Bannir un compte ne bannit plus d'office son adresse IP (FluxBB la préremplissait) : la dernière IP
  connue est proposée par une case non cochée, avec un avertissement (tous ceux qui partagent cette
  adresse seraient bloqués) ; compte, IP et e-mail restent des critères indépendants.
  **Un banni lit le forum mais n'y écrit plus** (FluxBB lui fermait tout le forum) : ses droits
  d'écriture sont retirés (messages, modification, suppression, e-mail, messagerie, renommée, balises
  du sujet), un bandeau rappelle l'échéance et le motif, et tout envoi de formulaire est refusé sauf
  connexion/déconnexion, « marquer comme lu » et abonnements.
- Censure (`admin_censoring.php`) : identique au PHP, avec jeton CSRF.
- Maintenance (`admin_maintenance.php`) : chaque lot de la reconstruction de l'index est envoyé en
  POST avec jeton CSRF (le PHP enchaînait des GET qui écrivaient), un script enchaîne les étapes et
  un bouton « Continuer » le remplace sans JavaScript. **Pas d'élagage** (suppression définitive des
  anciennes discussions) : il est remplacé par un seuil « Discussions anciennes » (`o_cold_topic_days`,
  clé propre à AvroBB, 0 = désactivé). Au-delà, une discussion non épinglée quitte la liste de son
  forum pour la page « Anciennes discussions » (`viewforum.php?id=…&old=1`, bouton en haut de la
  liste, masqué s'il n'y en a aucune) ; rien n'est supprimé, la recherche et les liens les trouvent.
  Le **mode maintenance** (interrupteur et message, `o_maintenance*`) se règle dans cette page et
  non plus dans les Options, avec un aperçu de la page vue par les membres
  (`admin_maintenance.php?preview=1`) ; l'alerte « mode maintenance activé » de l'en-tête y mène.
  Un message vide reprend le texte par défaut sans désactiver le mode.
- Apparence (`admin_appearance.php`, page propre à AvroBB, administrateurs) : remplacement du logo
  et de la bannière, rangés dans le stockage (`img/logo.png`, `img/banner.jpg`) ; type lu dans le
  contenu, réduction et réencodage (PNG pour le logo, JPEG pour la bannière) ; l'image précédente
  est gardée (`*.previous.*`) et peut être rétablie ; `o_header_version` (clé AvroBB) versionne les
  adresses pour contourner les caches. Sur grand écran, la bannière est affichée derrière le logo,
  menu en dessous.
- Messagerie privée : mêmes réglages que le PHP, avec jeton CSRF ; seules les clés modifiées sont
  écrites.
- AvroBB est un projet à part, apparenté à FluxBB : ce qui ne lui sert pas est retiré. Plus de
  comptes locaux (mot de passe, inscription, mot de passe oublié, ajout de membre par
  l'administration : les comptes viendront du SSO), plus de plugins de PV (Sondage, Mod Installer,
  FluxToolBar, Plugile, Uploadile, PunBalise, Smilies, AP_Premium), plus de contacts ni de listes
  d'envoi dans la messagerie, plus de section « Administration » dans le profil (admin_users.php la
  remplace) ; options sans effet retirées du formulaire et jamais écrites (compression GZip, formats
  de date et d'heure, langue par défaut, numéro de version) ; plus de numéro de version FluxBB.
- « Citer » ne reprend que le passage sélectionné dans le message, s'il y en a un
  (`public/js/quote-selection.js` ajoute `qtext=` au lien `post.php?tid=…&qid=…`, sous le nom de
  l'auteur) ; sans sélection ni JavaScript, le message entier comme dans FluxBB. Le passage est
  remis en BBCode d'après le HTML du message (gras, italique, souligné, barré, couleur, liens,
  images, listes, code, alignements, spoilers…) ; une citation imbriquée perd le nom de son auteur.
- Pied de page : plus de liste « Atteindre » (`o_quickjump` n'a plus d'effet côté Node) ; à la
  place, trois pages d'information propres à AvroBB, présentées comme les forums d'une catégorie et
  sans formulaire : Termes et règles (`terms.php`), Politique de confidentialité (`privacy.php`),
  Aide (`faq.php`). Textes par défaut dans `src/lang/fr/staticPages.ts`, modifiables dans
  Administration → Pages d'information (`admin_pages.php`) : titre, introduction et contenu au
  balisage simple (« ## » rubrique, ligne vide paragraphe, « [Libellé](adresse) » lien vers une page
  du forum ou http(s)), enregistrés en JSON dans `config` (`o_page_<page>`, clés AvroBB), texte
  toujours échappé ; retour possible au texte par défaut. Lisibles en mode maintenance et sans droit
  de lecture du forum.
- Nouvelle discussion sans balise de projet : le formulaire est réaffiché avec un avertissement
  (saisie conservée) ; un second « Valider » publie tel quel (`no_tag_ok`), pour les sujets qui ne
  concernent aucun projet. Pas d'avertissement pour un brouillon ni pour une réponse.
- Accueil : le bloc « Informations sur les forums » est remplacé par l'activité de la semaine
  (7 jours glissants) : « En ce moment » (membres en ligne avec avatar ou initiale, nombre d'invités),
  « Bienvenue à » (inscrits de la semaine), « Ça discute cette semaine » (4 discussions les plus
  commentées, en cartes avec la dernière image publiée, variante mobile si c'est une image du
  forum), « Projets de la semaine » (discussions actives par balise de projet). Les totaux
  sont sur la page Statistiques (`stats.php`, pied de page). « Marquer toutes les discussions comme
  lues » n'apparaît que s'il reste des nouveaux messages.
- En-têtes de sécurité sur toutes les réponses (FluxBB n'en envoyait pas) : CSP sans script en
  ligne (`script-src 'self'`), styles en ligne permis (couleurs des balises), images de partout en
  http(s), vidéos YouTube/Dailymotion seulement, formulaires vers le forum seulement,
  pas d'intégration dans un autre site ; `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS
  en HTTPS. Un script collé dans l'annonce ou les liens du menu
  par l'administrateur ne s'exécute plus.
- Référencement (le PHP n'en faisait pas) : balise description par page (extrait censuré du premier
  message d'une discussion, description du forum `o_board_desc` sinon), URL canonique absolue
  (`o_base_url`), aperçu de partage Open Graph des pages indexables (première image de la
  discussion, icône du forum sinon), `robots.txt` (formulaires et administration exclus) et
  `sitemap.xml` (accueil, pages d'information, forums et discussions lisibles par un invité).
- Icônes : favicon SVG, PNG de secours, icône d'écran d'accueil iOS et manifeste (`public/icons`,
  `public/manifest.json`), aux couleurs d'AvroBB ; `/favicon.ico` redirige vers la nouvelle icône.
- Pas de flux Atom : `extern.php?type=atom` sert le flux RSS (les anciens abonnements continuent de
  fonctionner) ; l'option « Flux par défaut » ne propose plus que Aucun ou RSS, et l'ancien choix
  Atom (`o_feed_type` = 2, celui de PV) n'affiche plus de lien de flux. Pas de flux des discussions
  actives à l'accueil ; avec RSS, liens de flux du forum et de la discussion.
- Pagination discrète (liens simples, page courante soulignée) et masquée quand il n'y a qu'une
  page (FluxBB affichait « Pages : 1 »).
- Page Balises de l'administration : balises du sujet (nom, groupe projet ou autre, couleur de
  fond, ordre ; renommer une balise la renomme dans les sujets existants, sans refaire l'index de
  recherche), en pastilles. Liste enregistrée dans `config` (`o_subject_tags`, clé AvroBB).
- Balises du sujet (PV, « préfixes » dans le PHP) : page `topic_prefixes.php`, propre à Node (le PHP n'a pas d'équivalent),
  ouverte par un bouton de viewtopic pour l'auteur de la discussion et les modérateurs du forum ; les
  préfixes connus sont réécrits dans l'ordre des listes, séparés du titre par une espace.
- Mentions de membres (ajout, propre à Node) : dans les zones de message (rédaction, réponse rapide,
  messagerie), « @ » suivi du début d'un nom propose des membres (`member_suggest.php`, réservé aux
  groupes qui voient la liste des membres) ; le choix insère `[url=<base>/profile.php?id=N]@Nom[/url]`,
  que le PHP affiche aussi comme un lien. Le champ des destinataires de la messagerie
  complète les noms de la même façon. À la publication d'un nouveau message, chaque membre
  mentionné (5 au plus) reçoit un message privé avec le lien vers le message, s'il peut lire la
  discussion et recevoir des messages privés (messagerie active, boîte non pleine) ; l'auteur n'en garde pas de copie. Rien n'est envoyé pour une modification ou un brouillon.
- Balises en tête de sujet (`[AvroBB]`, `[Résolu]`, `[BETA]`…) affichées en pastilles colorées sans
  crochets dans les listes de sujets, la recherche et le titre de viewtopic. Affichage seulement : le
  sujet enregistré garde ses crochets. Couleur réglée pour chaque balise proposée (texte clair ou
  foncé selon le fond).
- Balises du sujet, seules les balises proposées sont gardées : à l'enregistrement d'un sujet
  (nouvelle discussion, modification, brouillon, page « Balises du sujet »), les balises inventées en
  tête (`[BETA]`) sont retirées et les doublons supprimés ; un sujet réduit à des balises est refusé.
  Les anciens sujets ne sont pas réécrits, mais leurs balises inventées et doublons ne sont plus
  affichés par Node (le PHP les montre toujours). Les boutons du formulaire ajoutent une balise ou la
  retirent si elle y est déjà.
- Images envoyées (galerie, avatars, logo, bannière) : réduites par le navigateur avant l'envoi
  (`js/image-resize.js` : orientation EXIF, WebP, galerie à 1 024 px avec variante mobile de 640 px et
  vignette de 150 px, avatar recadré, logo et bannière dans leur cadre). Le serveur, sans
  bibliothèque d'images, lit type et dimensions dans le contenu et refuse ce qui dépasse ; sans
  JavaScript, le fichier part tel quel dans ces limites (galerie : 1,5 Mio, 4 096 px, 200 images par
  membre). La galerie insère une adresse relative (`[img]/img/gallery/…[/img]`, acceptée par `[img]`
  pour les seuls fichiers du forum) ; les anciennes adresses absolues restent reconnues. Dans les
  messages, une image WebP du forum est servie dans un `<picture>` qui donne la variante mobile aux
  écrans de 640 px au plus ; toutes les images sont chargées à la demande (`loading="lazy"`).
- Avatar : une image trop grande ou trop lourde est recadrée automatiquement aux dimensions permises
  (centre d'intérêt de l'image), au lieu d'être refusée ; elle garde le format GIF, JPEG ou PNG, les
  seuls que le PHP affiche, et passe en JPEG plus compressé si son poids dépasse encore la limite.
- Rédaction (`post.php`) : émojis conservés (le PHP remplaçait les caractères de 4 octets par « ? »,
  héritage d'une base en utf8 sur 3 octets) ; redirection immédiate vers le message ; boutons de
  préfixe du sujet en JavaScript et seulement pour une nouvelle discussion ; pas de réponse dans le
  lien d'un sujet déplacé ; un échec d'envoi des notifications n'annule pas le message ; modèles
  d'e-mail en français (`src/lang/fr/mail.ts`).
- Modification (`edit.php`) : un membre peut modifier son message pendant 30 minutes, comme PV le
  voulait (son code comparait `strtotime()` d'un timestamp, toujours faux : seuls les modérateurs
  pouvaient modifier) ; le lien « Modifier » de viewtopic suit la même règle. Le lien « Supprimer »
  suit exactement la règle de `delete.php` (le PHP pouvait afficher un lien refusé ensuite).
  Le formulaire présente le texte d'origine (le PHP y mettait le texte censuré, qui remplaçait
  alors définitivement les mots d'origine en base).
- Brouillons (PV) : table `brouillons` absente de la base locale, reconstituée d'après le code PHP
  (`tests/db/schema.sql`). « Poster » publie directement le brouillon (le PHP ouvrait une
  prévisualisation qu'il fallait encore valider) ; publier un brouillon le supprime ; sa modification suit les
  contrôles de `post.php` ; lien « Mes brouillons » sous les options du formulaire (le PHP n'y
  menait qu'après un enregistrement) ; la case est proposée à tout membre (le PHP la cachait quand
  les abonnements aux sujets étaient désactivés).
- Le menu mobile est un `<details>` sans JavaScript (PV : bouton burger en JS) ; pas d'icônes rapides.
- `profile.php` : consultation, sections de modification et avatar ; pas de section
  « Administration » (groupe, bannissement, suppression : voir admin_users.php).
- Modification du profil : seuls les champs affichés sont enregistrés (le PHP remettait `use_pm` ou
  `reputation_enable` à 0 quand la messagerie ou la renommée étaient désactivées) ; les erreurs
  réaffichent le formulaire, un enregistrement redirige avec un avis « Profil mis à jour » ;
  longueurs vérifiées par le serveur ; pas de choix des formats de date et d'heure (PV les ignore)
  ni de la langue ; l'adresse e-mail se modifie directement dans la section Principal (sans mot de
  passe, pas de lien de confirmation à envoyer), avec les règles d'adresse bannie ou déjà utilisée.
- Avatar : effacement confirmé en POST (le PHP effaçait sur un lien GET) ; mêmes droits que la
  modification du profil ; type lu dans le contenu du fichier ; l'URL porte `?m=<date>`.
- Renommage : les destinataires des MP sont remplacés élément par élément (le `REPLACE()` du PHP
  renommait aussi « MaxDUO » en renommant « Max ») ; le renommage et les autres champs sont
  enregistrés dans une même transaction.
- Messagerie privée (APMS, simplifiée) : conversations seulement, sans contacts, listes d'envoi ni
  blocage d'expéditeur. Table `messages` absente de la base locale, reconstituée d'après le code PHP
  (`tests/db/schema.sql`). Toutes les actions écrivent en POST avec jeton CSRF. Une réponse va aux
  participants qui détiennent encore la conversation (lus en base, pas dans un champ caché) ; on ne
  répond, ne cite, ne modifie et ne supprime que dans sa propre boîte ; « supprimer pour tous »
  (modérateurs) vise les copies du message, plus le texte identique dans toute la base ; quitter une
  conversation en retire tous les messages et marque « (supprimé) » chez les autres ; sujet ou
  message tout en capitales ramené en minuscules pour un simple membre (condition inversée dans le
  PHP) ; anti-flood sur `users.last_post` au lieu d'une session PHP ; après une réponse, on revient
  au message dans la conversation.
- Recherche : résultats mémorisés dans `search_cache` et anti-flood
  `g_search_flood`, comme le PHP ; le formulaire reste en GET et écrit donc `last_search` et le cache.
  Pas de recherche « CJK » par LIKE (inutile sur un forum francophone). Refus pour flood en 429.
- Premium (`premium.php`) : non repris (statut sans effet dans le forum PV).
- Galerie : recherche dans le titre et la description (`?q=`, conservée par la pagination et le filtre « Mes images », page non indexée) ; informations visibles sous chaque vignette (le PHP les montrait au survol, inaccessible
  au clavier et au toucher), vignette collée en haut de la tuile ; filtre « Mes images » (`?mine=1`).
  Envoi : PNG accepté en plus du JPEG et du GIF, type lu dans le contenu ; vignette (150 px, JPEG)
  calculée par le navigateur dans un canvas et vérifiée par le serveur, qui n'a pas de bibliothèque
  d'images (le PHP utilisait GD) ; sans JavaScript, l'image sert de vignette. Suppression en POST
  après confirmation, par l'auteur, un administrateur ou le groupe des modérateurs (le PHP la
  réservait à ce groupe, par un lien GET). Sélecteur `gallery.php?info=pick`, ouvert depuis les
  formulaires de rédaction : choisir une de ses images ou en envoyer une nouvelle (elle rejoint la
  galerie) et l'insérer avec son titre et sa description. Le bouton image de la barre d'outils
  ouvre un menu (adresse d'une image, mes images de la galerie, nouvelle image) ; la galerie
  s'ouvre alors dans une popin (`<dialog>` + iframe `gallery.php?info=pick&embed=1`, page sans
  en-tête) : ses propres images par défaut ou toute la galerie, recherche dans le titre et la
  description, boutons « Fermer » et « Insérer et fermer » (double-clic sur une tuile aussi) ;
  sans JavaScript,
  le lien « Images de la galerie » reste sous le formulaire. Une image de la galerie insérée avec
  son titre et sa description s'affiche en carte (`<figure>` : image, titre, légende) ; le PHP
  montre le même BBCode en titre gras, image et texte.
- Fichiers envoyés (R2) servis sous `/img/` : images seulement (type fixé à l'écriture d'après le
  contenu), clés fabriquées par le serveur, ETag ; une image effacée disparaît du cache en bordure
  en une heure au plus. Résolution inverse des IP (modération) par DNS sur HTTPS (Cloudflare).
- Adresses propres (`/sujet/4-premier-sujet`, `/forum/2-avrobb`, `/membre/3`, `/aide`…) définies dans
  `src/services/routes.ts` ; les pages d'action gardent leur `.php`. Les anciennes adresses des pages
  publiques restent servies, sans redirection, et sont exclues par `robots.txt`.
- extern.php : pas d'authentification HTTP Basic ni de cache des flux (`o_feed_ttl`).
- Connexion : pas de mot de passe ni d'inscription, comptes créés à la première connexion GitHub ou
  Google (OAuth avec state et PKCE, compte identifié par le fournisseur et non par l'e-mail, pseudo
  modifiable une fois par le membre) ; « me déconnecter de partout » ; suppression de son compte
  par le membre (messages publics gardés sous « Membre supprimé ») ; connexion de développement : jeton CSRF,
  adresse de retour limitée aux pages du forum, redirection immédiate, page accessible en
  maintenance. Session dans un cookie signé (HMAC-SHA256), prolongée une fois par jour ;
  déconnexion par un bouton POST avec jeton CSRF.
- E-mail à un membre et signalement (`misc.php`) : les erreurs réaffichent le formulaire au lieu
  d'une page de message ; adresse de retour limitée aux pages du forum ; signaler exige de pouvoir
  lire le message.
- « Marquer comme lu » et abonnements (sujet, forum) : formulaire POST ; un ancien lien GET (lien de
  désabonnement des e-mails) affiche une confirmation.
