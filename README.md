# pv-forum — prototype

Réécriture Node.js (TypeScript, MVC) du forum Pilote-Virtuel, page par page, sur la base FluxBB existante.
Ce prototype ne sert que `viewtopic.php`, en lecture seule ; les autres liens renvoient vers l'installation PHP.

## Lancer

```bash
cp .env.example .env    # renseigner LEGACY_COOKIE_SEED ($cookie_seed du config PHP)
npm install
npm run dev             # http://localhost:3000/viewtopic.php?id=4
npm test
npm run typecheck
```

Le conteneur `pv_db` de PiloteVirtuel doit tourner (port 3307). Un membre connecté sur
http://localhost:8080 est reconnu par le prototype : le cookie de session PHP est lu et vérifié.

## Organisation

| Couche | Dossier | Rôle |
|---|---|---|
| Modèle | `src/domain/`, `src/repositories/` | Objets du domaine ; seul endroit où l'on écrit du SQL (Kysely, typé) |
| Services | `src/services/` | Règles pures et testables : permissions, BBCode, dates, pagination, session |
| Présentation | `src/presenters/` | Domaine → modèle de vue (fonction pure) |
| Contrôleur | `src/controllers/` | Requête → repositories → presenter → réponse ; ni SQL ni HTML |
| Vue | `src/views/` | Nunjucks (syntaxe proche de Twig), échappement automatique |

Le préfixe des tables (`fo_`) est ajouté par `TablePrefixPlugin` : les requêtes utilisent les noms nus.

## Écarts connus avec FluxBB

- Pas d'écriture : ni compteur de vues, ni suivi des sujets lus (`action=new` va au dernier message).
- BBCode partiel (pas de listes, smilies, censure, balises propres à PiloteVirtuel).
- Pas de rangs ni de bannis dans le titre des membres, pas de réponse rapide.
- Textes en français seulement.
