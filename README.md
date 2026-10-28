# pv-forum — prototype

Réécriture Node.js (TypeScript, MVC) du forum Pilote-Virtuel, page par page, sur la base FluxBB existante.
Ce prototype ne sert que `viewtopic.php`, en lecture seule ; les autres liens renvoient vers l'installation PHP.

## Lancer

```bash
cp .env.example .env    # renseigner LEGACY_COOKIE_SEED ($cookie_seed du config PHP)
npm install
npm run dev             # http://localhost:3000/viewtopic.php?id=4
npm run check           # lint (Biome) + typecheck + tests rapides
npm run test:db         # tests sur une vraie base (pv_forum_test, recréée à chaque fois)
npm run parity -- 'viewtopic.php?id=4'     # compare le texte et les liens avec la page PHP
npm run screenshot -- 'http://localhost:3000/viewtopic.php?id=4' --widths 320,1280
```

Variables des tests sur base : `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`
(par défaut le conteneur `pv_db`, `root`/`root`), `TEST_DB_NAME` (doit finir par `_test`).
Les captures demandent un Chrome sans tête (`CHROME_BIN`, ou celui de Playwright s'il est installé).

Le conteneur `pv_db` de PiloteVirtuel doit tourner (port 3307). Un membre connecté sur
http://localhost:8080 est reconnu par le prototype : le cookie de session PHP est lu et vérifié.

## Organisation

| Couche       | Dossier                            | Rôle                                                                        |
| ------------ | ---------------------------------- | --------------------------------------------------------------------------- |
| Modèle       | `src/domain/`, `src/repositories/` | Objets du domaine ; seul endroit où l'on écrit du SQL (Kysely, typé)        |
| Services     | `src/services/`                    | Règles pures et testables : permissions, BBCode, dates, pagination, session |
| Présentation | `src/presenters/`                  | Domaine → modèle de vue (fonction pure)                                     |
| Contrôleur   | `src/controllers/`                 | Requête → repositories → presenter → réponse ; ni SQL ni HTML               |
| Vue          | `src/views/`                       | Nunjucks (syntaxe proche de Twig), échappement automatique                  |

Le préfixe des tables (`fo_`) est ajouté par `TablePrefixPlugin` : les requêtes utilisent les noms nus.

Front-end : `public/css/base.css` (mobile d'abord) et un fichier de variables par thème dans
`public/css/themes/` ; le contraste AA de chaque thème est vérifié par `tests/themes.test.ts`.
Les réglages du forum sont lus dans `cache/cache_config.php` du PHP quand il existe (comme `common.php`).

## Écarts connus avec FluxBB

- BBCode : écarts volontaires listés en tête de `src/services/bbcode.ts` (émojis au lieu des images,
  `[video]` en lecteur intégré, `[spoiler]` en `<details>`, liens `[topic]`… corrigés, balises
  déséquilibrées laissées en texte). Tout le reste est comparé au parseur PHP (`tests/bbcode/`).
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
  Fermer, épingler et poser ou retirer une balise de PV (`balises_modo`) passent par un bouton POST
  avec jeton CSRF (le PHP écrivait sur un lien GET, vérifié par le seul Referer) ; un ancien lien
  GET mène à une confirmation.
- Modération (`moderate.php`) : toutes les actions en POST avec jeton CSRF ; le premier message
  d'un sujet n'est jamais supprimé ni scindé, même par une requête forgée ; un modérateur ne peut
  pas supprimer un sujet ou un message où un administrateur a écrit ; les erreurs s'affichent dans
  la page ; « Laisser un lien de redirection » proposé coché pour un sujet seul, comme le PHP.
  Consultation d'IP : résolution inverse limitée à 2 secondes.
- Signalements (`admin_reports.php`) : bouton « Marquer comme traité » en POST avec jeton CSRF ;
  les 10 derniers signalements traités sont conservés, comme le PHP.
- Accueil de l'administration : pas de vérification de mise à jour (`action=check_upgrade`, le
  service de fluxbb.org n'existe plus). Statistiques du serveur : charge et visiteurs actifs pour
  tous, environnement Node.js et base de données pour les administrateurs ; pas de `phpinfo()`.
- Options (`admin_options.php`) : erreurs de saisie réaffichées dans le formulaire (toutes à la fois,
  le PHP s'arrêtait à la première) ; mot de passe SMTP jamais renvoyé au navigateur (le PHP y mettait
  une valeur factice) ; fuseau, langue et style limités aux listes proposées ; une URL de base au
  domaine accentué passe en punycode par l'analyseur d'URL de Node. Formats de date et d'heure
  enregistrés mais sans effet sur l'affichage (PV utilise des formats fixes).
- Catégories et forums (`admin_categories.php`, `admin_forums.php`) : erreurs réaffichées dans la
  page ; la suppression d'un forum se confirme par un bouton POST (le lien GET n'affiche que la
  confirmation) ; enregistrer un forum qui contient des sujets conserve son URL de redirection (le
  PHP la vidait, le champ n'étant pas envoyé) ; une permission qui diffère du groupe est signalée
  « (modifié) » au lieu de la seule couleur. Les listes « Atteindre » du PHP sont supprimées après
  chaque modification, il les régénère.
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
- Plugins (`admin_loader.php`) : Node sert les plugins portés et redirige les autres vers
  `LEGACY_BASE_URL`. « Gestion d'utilisateur » (AMP) : seul l'ajout est repris (l'élagage était
  désactivé par PV : formulaire sans bouton) ; mot de passe de 6 caractères au moins comme ailleurs
  dans Node (4 dans le plugin) ; erreurs réaffichées dans le formulaire ; e-mails d'alerte et de
  bienvenue tirés des modèles du PHP.
- Bannissements (`admin_bans.php`) : suppression par bouton POST après confirmation (le PHP
  supprimait sur un lien GET) ; erreurs réaffichées dans le formulaire ; un octet « 000 » d'une IP
  devient « 0 » (le PHP le vidait) ; dates de recherche aux formats proposés (aaaa-mm-jj).
- Censure (`admin_censoring.php`) : identique au PHP, avec jeton CSRF ; `cache_censoring.php` est
  supprimé après chaque modification.
- Maintenance (`admin_maintenance.php`) : chaque lot de la reconstruction de l'index est envoyé en
  POST avec jeton CSRF (le PHP enchaînait des GET qui écrivaient), un script enchaîne les étapes et
  un bouton « Continuer » le remplace sans JavaScript ; l'élagage demande confirmation comme le PHP.
  Ajout : « Vider les caches » supprime les fichiers `cache/cache_*.php`, que le PHP régénère.
- Rédaction (`post.php`) : émojis conservés (le PHP remplaçait les caractères de 4 octets par « ? »,
  héritage d'une base en utf8 sur 3 octets) ; redirection immédiate vers le message ; boutons de
  préfixe du sujet en JavaScript et seulement pour une nouvelle discussion ; pas de réponse dans le
  lien d'un sujet déplacé ; un échec d'envoi des notifications n'annule pas le message ; modèles
  d'e-mail en français pour tous.
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
- `profile.php` : Node sert la consultation, les sections de modification, le mot de passe,
  l'adresse, l'avatar et les plugiles ; seule la section « Administration » (groupe, modération,
  bannissement, suppression) est redirigée vers `LEGACY_BASE_URL` (lot Administration).
- Biographie affichée directement sur le profil (le PHP la cache derrière `?plugin=UP_Ma_biographie.php`).
- Modification du profil : seuls les champs affichés sont enregistrés (le PHP remettait `use_pm` ou
  `reputation_enable` à 0 quand la messagerie ou la renommée étaient désactivées) ; les erreurs
  réaffichent le formulaire, un enregistrement redirige avec un avis « Profil mis à jour » ;
  longueurs vérifiées par le serveur ; pas de choix des formats de date et d'heure (PV les ignore)
  ni de la langue ; les plugiles « UP_ » ne sont plus recopiés dans la section Principal ; un simple
  membre qui change son adresse dans Principal (`o_regs_verify` désactivé) suit les règles
  d'adresse bannie ou déjà utilisée.
- Mot de passe : l'ancien est toujours demandé pour changer le sien, modérateur compris ;
  6 caractères au moins. Une clé d'activation n'active que ce qu'elle annonce (hash ou adresse).
  Les liens d'activation reçus par e-mail (mot de passe, adresse) écrivent en GET, comme le PHP.
- Avatar : effacement confirmé en POST (le PHP effaçait sur un lien GET) ; mêmes droits que la
  modification du profil ; type lu dans le contenu du fichier ; l'URL porte `?m=<date>`.
- Plugiles privés (`UPP_Suivile`, `UPP_Mes_uploads`) réservés au membre et aux administrateurs (le
  PHP ne contrôlait rien : n'importe qui pouvait désabonner un membre ou supprimer ses fichiers).
- Uploadile : nom de fichier réduit à lettres, chiffres et tirets ; extensions exécutables ou
  interprétées par le navigateur (php, html, svg, js…) toujours refusées ; pas de miniature créée
  (celles qui existent restent affichées ; sinon l'image elle-même sert d'aperçu) ; formulaires
  limités à 16 Mio. Gestionnaire (`gestionnaire.php`) dans la mise en page commune ; « Insérer »
  ajoute une image en `[img]` et un autre fichier en lien, à la position du curseur du message
  (le PHP insérait un lien « Votre texte ici » pour une image sans miniature).
- Renommage : les destinataires des MP sont remplacés élément par élément (le `REPLACE()` du PHP
  renommait aussi « MaxDUO » en renommant « Max ») ; le renommage et les autres champs sont
  enregistrés dans une même transaction.
- Messagerie privée (APMS) : tables `messages`, `contacts`, `sending_lists` absentes de la base
  locale, reconstituées d'après le code PHP (`tests/db/schema.sql`). Toutes les actions écrivent en
  POST avec jeton CSRF ; les anciens liens GET (« Ajouter aux contacts » du profil, suppression ou
  changement de droits d'un contact, suppression d'une liste) mènent à une confirmation. Une
  réponse va aux participants qui détiennent encore la conversation (lus en base, pas dans un champ
  caché) ; on ne répond, ne cite, ne modifie et ne supprime que dans sa propre boîte ; « supprimer
  pour tous » (modérateurs) vise les copies du message, plus le texte identique dans toute la base ;
  quitter une conversation en retire tous les messages et marque « (supprimé) » chez les autres ;
  sujet ou message tout en capitales ramené en minuscules pour un simple membre (condition inversée
  dans le PHP) ; anti-flood sur `users.last_post` au lieu d'une session PHP ; une liste d'envoi aux
  destinataires invalides est refusée (le PHP l'enregistrait) ; après une réponse, on revient au
  message dans la conversation.
- Recherche : résultats mémorisés dans `search_cache` (lisibles par le PHP) et anti-flood
  `g_search_flood`, comme le PHP ; le formulaire reste en GET et écrit donc `last_search` et le cache.
  Pas de recherche « CJK » par LIKE (inutile sur un forum francophone). Refus pour flood en 429.
- Premium (`premium.php`) : page dans la mise en page du forum ; le membre est celui de la session
  (le PHP lisait l'identifiant dans le cookie sans le vérifier et se connectait à la base avec des
  identifiants écrits en dur) ; la ligne `apremium` n'est créée qu'à l'activation d'un code (le PHP
  l'écrivait à chaque visite) ; activation en POST avec jeton CSRF, code refusé signalé ; un code
  prolonge un compte encore actif à partir de son expiration (le PHP repartait du jour). Tables
  `apremium`, `acodes15`, `acodes365` sans préfixe, reconstituées pour les tests. Boutique
  Digiseller chargée par `public/js/premium-shop.js` (même script que le PHP, hors de la page).
- Galerie : informations visibles sous chaque vignette (le PHP les montrait au survol, inaccessible
  au clavier et au toucher), vignette collée en haut de la tuile ; filtre « Mes images » (`?mine=1`).
  Envoi : PNG accepté en plus du JPEG et du GIF, type lu dans le contenu ; vignette (150 px, JPEG)
  calculée par le navigateur dans un canvas et vérifiée par le serveur, qui n'a pas de bibliothèque
  d'images (le PHP utilisait GD) ; sans JavaScript, l'image sert de vignette. Suppression en POST
  après confirmation, par l'auteur, un administrateur ou le groupe des modérateurs (le PHP la
  réservait à ce groupe, par un lien GET). Sélecteur `gallery.php?info=pick`, ouvert depuis les
  formulaires de rédaction : choisir une de ses images ou en envoyer une nouvelle (elle rejoint la
  galerie) et l'insérer avec son titre et sa description.
- extern.php : pas d'authentification HTTP Basic ni de cache des flux (`o_feed_ttl`).
- Connexion : jeton CSRF, adresse de retour limitée aux pages du forum (le PHP permettait une
  redirection ouverte), redirection immédiate sans page « Redirection… », page accessible en
  maintenance (le PHP empêchait un administrateur déconnecté de revenir).
- Inscription : mot de passe de 6 caractères au moins, comme l'annonce le formulaire (le code PHP
  en acceptait 4) ; pas de choix de la langue (une seule installée).
- E-mail à un membre et signalement (`misc.php`) : les erreurs réaffichent le formulaire au lieu
  d'une page de message ; adresse de retour limitée aux pages du forum ; signaler exige de pouvoir
  lire le message.
- « Marquer comme lu » et abonnements (sujet, forum) : formulaire POST ; un ancien lien GET (pages
  PHP, lien de désabonnement des e-mails) affiche une confirmation.
- Le jeton du lien « Déconnexion » dépend de l'IP vue par le serveur : derrière un proxy, régler
  `TRUST_PROXY=1` (et `FORUM_BEHIND_REVERSE_PROXY` côté PHP) pour que les deux voient la même.
