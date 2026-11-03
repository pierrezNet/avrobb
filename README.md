# AvroBB

🌐 **En ligne : [avrobb.org](https://avrobb.org)**

Forum personnel d'Emmanuel Pierrez, lieu d'échange autour de ses projets. Lecture publique, écriture
réservée aux membres, comptes par SSO (GitHub, Google en option).

AvroBB descend de **FluxBB 1.5.4**. Il prolonge le travail qu'Emmanuel Pierrez a mené sur le forum
de Pilote-Virtuel (migration d'une ancienne version de FluxBB vers la 1.5.4, thème responsive, puis
réécriture en Node.js/TypeScript), dont il est devenu un projet distinct et indépendant : schéma de
base neuf, plus de PHP, hébergement entièrement chez **Cloudflare** (Workers, D1, R2, Workers AI).
Le plan et l'avancement sont dans [`TODO.md`](TODO.md), les règles de travail dans
[`CLAUDE.md`](CLAUDE.md).

## État actuel

En ligne depuis le 30 octobre 2026. Lots 1 à 8 terminés (application Cloudflare, connexion SSO,
images et e-mails, adresses propres, cache en bordure, déploiement automatique, mise en ligne), puis
forum bilingue (interface anglaise sous `/en/`, traduction automatique du contenu). La suite est dans
la TODO.

L'application est un **Worker Cloudflare** (`src/worker.ts`), lancé en local par `wrangler dev` avec
D1 et R2 locaux (`.wrangler/state`). Comptes par **GitHub** (Google en option) : créer une
application OAuth (URL de retour `http://localhost:8787/auth/github/callback`) et renseigner
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` et `ADMIN_ACCOUNTS` dans `.dev.vars`. La **connexion de
développement** (`DEV_LOGIN=1`) reste disponible depuis la machine, jamais en production. Sans clé
Resend, les e-mails sont seulement notés dans le journal. La liaison Workers AI appelle le vrai
service même sous `wrangler dev` (quota du compte).

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
`scripts/brand.py`). Tâches planifiées (`triggers` de `wrangler.jsonc`) : chaque nuit, purge de la
table `online`, des fichiers orphelins et des traductions périmées ; chaque heure, traductions en
attente. En local : `npx wrangler dev --test-scheduled`, puis
`curl 'http://localhost:8787/cdn-cgi/handler/scheduled?cron=7+*+*+*+*'` (cron horaire).

## Déploiement

Une fois pour toutes (compte Cloudflare sur l'offre **Workers Paid**, `npx wrangler login`) :

1. Base et fichiers : `npx wrangler d1 create avrobb --location weur` (copier l'identifiant dans
   `wrangler.jsonc`, `database_id`), `npx wrangler r2 bucket create avrobb-files`,
   `npx wrangler r2 bucket create avrobb-backups` (sauvegardes, privé).
2. Schéma : `npm run db:migrate:remote`.
3. Secrets : `npx wrangler secret put` pour `SESSION_SECRET` (`openssl rand -hex 32`),
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `ADMIN_ACCOUNTS` (`github:…,google:…`), `RESEND_API_KEY`, `MAIL_FROM`, et pour les notifications
   push `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`node scripts/generate-vapid.mjs`).
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

## Fonctionnalités

AvroBB garde l'organisation de FluxBB (catégories, forums, discussions, groupes et permissions,
modération, messagerie privée, renommée, recherche, flux RSS) et y ajoute ou change ce qui suit.

**Comptes et sécurité**
- Connexion par GitHub ou Google uniquement (OAuth avec `state` et PKCE) : ni mot de passe, ni
  inscription ; compte identifié par le fournisseur, jamais par l'e-mail ; pseudo modifiable une
  fois ; « me déconnecter de partout » ; suppression du compte par le membre (messages publics gardés
  sous « Membre supprimé »). Adresse e-mail : celle, vérifiée, du fournisseur, que le membre peut
  effacer mais pas remplacer.
- Session dans un cookie signé (HMAC-SHA256, `__Host-`), sans table de sessions.
- Jeton CSRF sur tous les formulaires, aucune écriture par un simple lien ; droits vérifiés côté
  serveur ; limitation de débit sur la connexion, les écritures et la recherche.
- En-têtes de sécurité : CSP sans script en ligne, HSTS, `nosniff`, pas d'intégration dans un autre
  site.
- Un membre banni lit le forum mais n'écrit plus, avec un bandeau qui indique l'échéance et le motif.

**Lecture**
- Mobile d'abord : cartes empilées, menu repliable sans JavaScript, cibles tactiles de 44 px ;
  thèmes réduits à des variables CSS (contraste AA vérifié par `tests/themes.test.ts`).
- Adresses propres (`/sujet/4-premier-sujet`, `/forum/2-avrobb`, `/membre/3`, `/aide`…) définies dans
  `src/services/routes.ts` ; les pages d'action gardent leur `.php`.
- Accueil vivant : membres en ligne, nouveaux inscrits, discussions les plus commentées de la
  semaine en cartes, projets de la semaine ; totaux sur la page Statistiques.
- Balises de sujet (projets, état) en pastilles colorées, choisies dans une liste réglée par
  l'administration ; liens « Site du projet » et « Dépôt » par forum.
- Discussions anciennes regroupées dans une page à part au lieu d'être élaguées : rien n'est supprimé.
- Référencement : description par page, URL canonique, aperçu de partage Open Graph, `robots.txt`
  et `sitemap.xml`.
- Pages d'information (Termes et règles, Politique de confidentialité, Aide) modifiables dans
  l'administration.

**Forum bilingue**
- Interface en français (sans préfixe) et en anglais sous `/en/` (`/en/topic/4-…`, `/en/member/3`…) :
  une instance de l'application par langue (`src/worker.ts`, `localizePath`/`delocalizePath` de
  `services/routes.ts`), textes dans `src/lang/fr` et `src/lang/en` (type `Lang` : rien ne manque à
  la compilation), `hreflang` et plan du site dans les deux langues.
- Contenu (messages, titres, noms et descriptions des forums) traduit une fois par **Workers AI**
  (Mistral Small 3.1), juste après l'écriture, et rattrapé chaque heure (40 textes par passage). Le
  BBCode, les liens, le code et les noms des projets sont protégés par des marqueurs contrôlés au
  retour ; chaque traduction garde le texte qu'elle traduit et ne s'affiche que s'il n'a pas changé
  (table `translations`, migration 0009). Mention « Traduit automatiquement » et texte d'origine à
  déplier. Messages privés et e-mails jamais traduits ; nom et description anglais d'un forum
  saisissables dans l'administration.

**Application installable et notifications push**
- Manifeste en `standalone` et service worker à la racine (`public/sw.js`) : AvroBB s'installe sur
  téléphone et ordinateur. Aucune page n'est mise en cache (jamais de contenu périmé) ; sans réseau,
  une page « hors ligne » (`public/offline.html`).
- Notifications push (Web Push, chiffrement RFC 8291 et VAPID écrits avec `crypto.subtle`, sans
  dépendance) : messages privés et mentions, réponses aux discussions suivies, chacun réglable dans
  le profil ; un abonnement par appareil (table `push_subscriptions`, migration 0010), dans la langue
  de la page où il a été pris ; seuls les services de push des navigateurs sont appelés. Les e-mails
  ne changent pas. Clés : `node scripts/generate-vapid.mjs`, puis `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` en secrets ; sans elles, ni bouton ni envoi.

**Écrire**
- BBCode avec émojis, `[video]` en lecteur intégré, `[spoiler]` en `<details>` ; écarts listés en
  tête de `src/services/bbcode.ts`, comportement figé par les instantanés de `tests/bbcode/`.
- Images réduites par le navigateur avant l'envoi (WebP, variante mobile et vignette) ; le serveur,
  sans bibliothèque d'images, lit type et dimensions dans le contenu et refuse ce qui dépasse ; sans
  JavaScript, le fichier part tel quel dans ces limites. Fichiers dans R2, servis sous `/img/`.
- Galerie : recherche, « Mes images », sélecteur intégré à l'éditeur (insertion en carte avec titre
  et légende).
- Mentions `@membre` avec complètement des noms ; le membre mentionné est prévenu par message privé.
- « Citer » ne reprend que le passage sélectionné ; brouillons ; avertissement pour une nouvelle
  discussion sans balise de projet.

**Applications et administration**
- Retours des applications Phraséo et Donne Ton Point : reçus par liaison de service (points
  d'entrée `PhraseoFeedback` et `DonneTonPointFeedback`, aucune adresse publique) dans un forum privé
  « à trier », signés d'un compte système ; le contact de l'auteur part par e-mail, jamais dans le
  sujet ; bouton « Accepter » pour publier un retour dans le forum public de l'application. Un profil
  par application dans `services/appFeedback.ts`.
- Apparence : logo et bannière remplaçables, avec retour à l'image précédente.
- Mode maintenance avec aperçu ; erreurs de saisie réaffichées dans tous les formulaires
  d'administration ; plus de système de plugins (leurs pages sont dans le menu d'administration).
