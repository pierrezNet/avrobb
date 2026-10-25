# TODO — Portage de Pilote-Virtuel vers Node.js

Méthode : lots ordonnés, chaque lot livrable seul. Le forum reste utilisable de bout en bout à chaque étape, car PHP et Node partagent la base et le cookie. Chaque page suit le skill `port-page` et passe `mvc-review` avant d'être cochée.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` terminé · **(PV)** = fonctionnalité propre à Pilote-Virtuel (absente de FluxBB standard).

## Pourquoi cet ordre

1. **Socle d'abord** : outillage, mise en page et CSS responsive sont partagés par toutes les pages. Les refaire après coup coûterait N fois.
2. **Lecture avant écriture** : les pages en lecture seule ne présentent aucun risque pour la base partagée, couvrent la majorité du trafic et valident l'architecture (on part du POC `viewtopic`).
3. **Authentification avant écriture** : poster, éditer ou envoyer un MP suppose une session, un CSRF et des bannissements fiables.
4. **Rédaction avec l'index de recherche** : un message posté par Node doit être indexé comme le fait le PHP, sinon la recherche PHP se dégrade.
5. **Communauté (MP, réputation, sondages…) ensuite** : ces modules dépendent de la session et de l'éditeur.
6. **Modération puis administration en dernier** : peu d'utilisateurs, et le back-office PHP continue de fonctionner sur la même base pendant tout ce temps. C'est aussi là que se trouvent les invalidations de cache les plus délicates.
7. **Bascule** : retrait du PHP une fois tout porté.

---

## Lot 0 — Socle technique

- [x] `git init` et premier commit du POC (le projet PHP n'est pas versionné : se protéger ici)
- [x] Lint et formatage (Biome : une seule dépendance, configuré pour tabulations et apostrophes simples) + script `npm run check` (lint, typecheck, test)
- [x] Gestion d'erreurs centralisée (`setErrorHandler`, 404 et 500 rendus avec `message.njk`, journalisation sans fuite d'informations)
- [x] Mise en page commune complète : en-tête (menu selon droits, bienvenue, nouveaux MP, liens de modération), pied (quickjump, « Propulsé par »), fil d'Ariane réutilisable
- [x] **CSS responsive** : feuille de base mobile d'abord + 6 thèmes FluxBB réduits à des variables CSS ; choix du thème utilisateur (`users.style`)
- [x] Chargement de `config` (table) avec invalidation, lecture des caches PHP
- [x] Langue : structurer `src/lang/fr.ts` par page → `src/lang/fr/` (fichiers `lang/French/*.php` comme source)
- [x] Tests d'intégration contre une vraie base (conteneur `pv_db`, base de test dédiée) en complément des doublures
- [x] Mesure de parité : script qui compare le HTML ou le texte utile d'une page PHP et de son équivalent Node

## Lot 1 — Lecture publique

- [x] **viewtopic** : terminer le POC
  - [x] BBCode complet (`include/parser.php`) : parité vérifiée contre le vrai parseur PHP (`npm run bbcode:reference`)
  - [x] Smileys en émojis Unicode (décision du 24/10/2026, pas d'images) et censure (`censoring`)
  - [x] Balises propres à PV (`balises`, `balises_modo`) en préfixe du sujet **(PV)**
  - [x] Titre des bannis (`get_title()` complet ; FluxBB 1.5 n'a plus de rangs)
  - [x] Affichage de la réputation sous l'auteur (`include/reputation/rep_viewtopic.php`) et lien MP (APMS) **(PV)**
  - [x] ~~Affichage du sondage du sujet~~ : sans objet, PV n'affiche aucun sondage (`AP_Sondage` est un reste sans table ni affichage)
  - [x] ~~Pièces jointes~~ : sans objet, les uploads sont insérés par `[img]`/`[url]` (gestionnaire : lot 5)
- [x] **index** : catégories, forums, derniers messages, statistiques, utilisateurs en ligne (nouveau gabarit en `<div>`)
- [x] **viewforum** : liste des sujets, pagination, épinglés, déplacés, icônes lu/non lu (lecture seule)
- [x] **userlist** : recherche, tri, pagination
- [x] **profile** (consultation) : sections publiques, biographie (`UP_Ma_biographie`) **(PV)** ; la modification (soi-même, modérateurs autorisés, `section`, `action`, autres plugiles) est renvoyée vers le PHP
- [x] **help** (aide BBCode et émoticônes, exemples rendus par le parseur) — `balises.php` n'est pas une page mais l'inclusion qui colore les balises dans viewforum (fait, `styleSubject()`)
- [x] **search** : formulaire et résultats (lecture de l'index existant `search_*`, `search_cache`) — résultats mémorisés dans `search_cache` et anti-flood (repris après le lot 3)
- [x] **extern.php** : flux RSS/Atom/XML et HTML externe (identiques au PHP) — authentification HTTP Basic (lot 2) et cache `o_feed_ttl` non repris
- [x] **gallery** (consultation) **(PV)** — envoi et modération renvoyés vers le PHP (lot 5) ; table `fo_gallery` absente du schéma local, reconstituée pour les tests

## Lot 2 — Authentification et session

- [x] Émission du cookie FluxBB par Node (`pun_setcookie()`), renouvellement et expiration (vérifié dans les deux sens avec le PHP)
- [x] **login** / **logout**, « se souvenir de moi », redirection (limitée aux pages du forum), MD5 hérité mis à niveau
- [x] Mot de passe oublié (e-mail, jeton d'activation) : service d'envoi d'e-mails (nodemailer) et modèles `mail_templates` ; activation par `profile.php?action=change_pass` (portée au lot 4)
- [x] **register** : règles, validation, vérification par e-mail, `check_username()`, alertes à la liste d'administration
- [x] Jeton CSRF commun à tous les formulaires (double soumission + Origin, `partials/forms.njk`)
- [x] Bannissements (`bans` : pseudo, IP, expiration ; l'e-mail ne sert qu'à l'inscription) + mode maintenance
- [x] Table `online` : présence et invités, mise à jour par requête, `last_visit`, purge (`update_users_online()`)
- [x] Suivi des sujets lus (`action=new`, marquer comme lu en POST, règles) — `misc.php` en partie porté
- [x] Compteur de vues des sujets
- [x] Contrôle d'accès par groupe et par forum (`forum_perms`) généralisé (`repositories/forumPermissions.ts`)

## Lot 3 — Rédaction

- [x] Service d'**indexation de recherche** (`include/search_idx.php`) : ajout, mise à jour, suppression — `preparse_bbcode()` porté avec, parité vérifiée contre le PHP
- [x] **post** : nouveau sujet, réponse, citation, prévisualisation, anti-flood, mise à jour des compteurs (notifications aux abonnés comprises)
- [x] Réponse rapide sous viewtopic
- [x] Barre d’outils BBCode (FluxToolBar : `toolbar_conf`, `toolbar_tags`) en JS progressif
- [x] **edit** et **delete** (message, sujet)
- [x] Brouillons (`brouillons`, `draft_list`, `draft_edit`) **(PV)**
- [x] Abonnements aux sujets et forums + notifications par e-mail
- [x] Signalement d'un message (`misc.php?report`) et e-mail à un membre (`misc.php?email`)
- [x] ~~Création et vote dans les sondages~~ : sans objet, `AP_Sondage` est un reste sans table ni affichage (voir lot 1) **(PV)**
- [ ] Préfixes du sujet (`[MSFS]`, `[FS-24]`… et `[Résolu]`, `[Réel]`, `[Video]`) : l'auteur peut toujours en ajouter ou en retirer sur sa discussion, **même après les 30 minutes** de modification du message (action dédiée qui ne touche qu'au sujet ; listes aujourd'hui en dur dans `post.php`/`edit.php` et `presenters/postPage.ts`) **(PV)**

## Lot 4 — Profil (édition)

- [x] Sections du profil : essentiel, personnel, messagerie, personnalité, affichage, confidentialité (renommage et ses effets de bord compris ; la section « Administration » reste en PHP jusqu'au lot 7)
- [x] Avatar : téléversement et contrôles (type lu dans le contenu, poids, dimensions), effacement confirmé en POST
- [x] Signature (prévisualisation, limites)
- [x] Changement de mot de passe et d'e-mail, liens d'activation (y compris celui du mot de passe oublié)
- [x] Plugiles : Ma biographie, Suivi des sujets (`UPP_Suivile`), Mes uploads (`UPP_Mes_uploads`) **(PV)**

## Lot 5 — Fonctionnalités communautaires PV

- [x] Messagerie privée : boîte de réception, lecture, envoi, contacts, listes d'envoi (`messages`, `contacts`, `sending_lists`) **(PV)** — alertes par e-mail (`new_pm*.tpl`) comprises ; vérifiée dans les deux sens avec le PHP
- [x] Réputation : vote, historique, page `reputation.php` **(PV)** — suppression de votes par les administrateurs et modérateurs
- [x] Uploads et gestionnaire de fichiers (`gestionnaire.php`, Uploadile) **(PV)** — envoi, suppression et insertion dans le message ; pas de création de miniatures (le PHP utilisait GD)
- [x] Galerie : ajout et gestion **(PV)** — vignette calculée par le navigateur (canvas), suppression par l'auteur et l'équipe
  - [x] Tuiles : image collée en haut de la tuile (sans marge au-dessus)
  - [x] Filtre « Mes images » pour ne voir que les siennes
  - [x] Insertion d'image dans un message : en plus de l'URL, choisir parmi ses images de la galerie, ou
    téléverser une image depuis l'édition du message (elle rejoint alors la galerie) — `gallery.php?info=pick`
  - [x] Image insérée avec son titre et sa description (la description, obligatoire dans la galerie, est
    aujourd'hui perdue à l'insertion)
- [ ] Premium (`premium`, `premium.php`) **(PV)**

## Lot 6 — Modération

- [ ] `moderate.php` : fermer/ouvrir, épingler, déplacer, fusionner, scinder, suppression multiple
- [ ] Consultation d'IP (`get_host`)
- [ ] Traitement des signalements
- [ ] Balises réservées aux modérateurs (`balises_modo`) **(PV)**

## Lot 7 — Administration

- [ ] Accueil et statistiques
- [ ] Options (`admin_options`) avec invalidation de `cache_config.php`
- [ ] Catégories, forums, permissions par forum
- [ ] Groupes, utilisateurs (recherche, actions de masse), gestion utilisateurs (AMP) **(PV)**
- [ ] Bannissements, censure, rapports
- [ ] Maintenance : reconstruction de l'index de recherche, vidage des caches, mode maintenance
- [ ] Plugins d'administration : balises, smileys, toolbar, premium, sondages, uploads, messagerie privée **(PV)**

## Lot 8 — Bascule et décommissionnement

- [ ] **Hébergement Node** : la production actuelle est un hébergement PHP (Apache/LiteSpeed). Choisir la cible (VPS, Node géré, Passenger…). **Décision à prendre tôt**, idéalement pendant le lot 1, car elle conditionne le déploiement.
- [ ] Déploiement : reverse proxy, HTTPS, gestion des processus, journaux, sauvegardes de la base
- [ ] Performance : index SQL manquants, cache HTTP des pages publiques, ressources statiques
- [ ] Sécurité : en-têtes (CSP, HSTS), limitation de débit sur login et inscription, audit (`/security-review`)
- [ ] Migration des mots de passe SHA-1 vers argon2 au fil des connexions (seulement après l'arrêt du PHP)
- [ ] URL propres sans `.php` (`/sujet/4`, `/forum/2`…) avec redirections 301 depuis les anciennes (`viewtopic.php?id=4`), pour garder liens externes et référencement ; d'ici là, Node conserve volontairement les URL du PHP pour cohabiter avec lui
- [ ] Retrait de `LEGACY_BASE_URL`
- [ ] Arrêt de l'installation PHP

---

## Écarts connus du POC (rappel du README)

- Dates du POC au format de la config au lieu de `d/m/Y H:i` de PV → corrigé au lot 0 (trouvé par `npm run parity`)

- Pas d'écriture (vues, sujets lus) → lot 2
- BBCode partiel, smileys, censure, balises PV → lot 1
- Rangs et bannis absents du titre → lot 1
- Pas de réponse rapide → lot 3
