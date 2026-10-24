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
- Site web du profil : préfixé de `http://` s'il n'a pas de schéma (le PHP laissait passer `javascript:`).
- Textes en français seulement.
- Liens de modération du pied de page affichés : PV les masque visuellement (`sr-only`) sans autre accès.
- Balises PV réservées aux modérateurs (`balises_modo`) absentes du pied de viewtopic → lot Modération.
- Rédaction (`post.php`) : émojis conservés (le PHP remplaçait les caractères de 4 octets par « ? »,
  héritage d'une base en utf8 sur 3 octets) ; redirection immédiate vers le message ; boutons de
  préfixe du sujet en JavaScript et seulement pour une nouvelle discussion ; pas de réponse dans le
  lien d'un sujet déplacé ; un échec d'envoi des notifications n'annule pas le message ; modèles
  d'e-mail en français pour tous.
- Modification (`edit.php`) : un membre peut modifier son message pendant 30 minutes, comme PV le
  voulait (son code comparait `strtotime()` d'un timestamp, toujours faux : seuls les modérateurs
  pouvaient modifier) ; le lien « Modifier » de viewtopic suit la même règle. Le lien « Supprimer »
  suit exactement la règle de `delete.php` (le PHP pouvait afficher un lien refusé ensuite).
- Brouillons (PV) : table `brouillons` absente de la base locale, reconstituée d'après le code PHP
  (`tests/db/schema.sql`). Publier un brouillon repris le supprime ; sa modification suit les
  contrôles de `post.php` ; lien « Mes brouillons » sous les options du formulaire (le PHP n'y
  menait qu'après un enregistrement) ; la case est proposée à tout membre (le PHP la cachait quand
  les abonnements aux sujets étaient désactivés).
- Le menu mobile est un `<details>` sans JavaScript (PV : bouton burger en JS) ; pas d'icônes rapides.
- `profile.php` : Node ne sert que la consultation ; tout cas de modification est redirigé vers
  `LEGACY_BASE_URL`, qui doit donc désigner une adresse servie par le PHP (sinon boucle).
- Biographie affichée directement sur le profil (le PHP la cache derrière `?plugin=UP_Ma_biographie.php`).
- Recherche : résultats mémorisés dans `search_cache` (lisibles par le PHP) et anti-flood
  `g_search_flood`, comme le PHP ; le formulaire reste en GET et écrit donc `last_search` et le cache.
  Pas de recherche « CJK » par LIKE (inutile sur un forum francophone). Refus pour flood en 429.
- Galerie : informations visibles sous chaque vignette (le PHP les montrait au survol, inaccessible
  au clavier et au toucher) ; envoi et modération restent en PHP.
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
