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

- Pas d'écriture : ni compteur de vues, ni suivi des sujets lus (`action=new` va au dernier message).
- BBCode : écarts volontaires listés en tête de `src/services/bbcode.ts` (émojis au lieu des images,
  `[video]` en lecteur intégré, `[spoiler]` en `<details>`, liens `[topic]`… corrigés, balises
  déséquilibrées laissées en texte). Tout le reste est comparé au parseur PHP (`tests/bbcode/`).
- Renommée : la condition PHP sur `reputation_enable_adm` (colonne absente du schéma local) est ignorée.
- Site web du profil : préfixé de `http://` s'il n'a pas de schéma (le PHP laissait passer `javascript:`).
- Textes en français seulement.
- Liens de modération du pied de page affichés : PV les masque visuellement (`sr-only`) sans autre accès.
- Balises PV réservées aux modérateurs (`balises_modo`) absentes du pied de viewtopic → lot Modération.
- Pas d'abonnement au sujet ni de réponse rapide sous viewtopic → lot Rédaction.
- Le menu mobile est un `<details>` sans JavaScript (PV : bouton burger en JS) ; pas d'icônes rapides.
- Le jeton du lien « Déconnexion » dépend de l'IP vue par le serveur : derrière un proxy, régler
  `TRUST_PROXY=1` (et `FORUM_BEHIND_REVERSE_PROXY` côté PHP) pour que les deux voient la même.
