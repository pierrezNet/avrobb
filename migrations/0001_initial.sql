-- Schéma initial d'AvroBB pour D1 (SQLite).
--
-- Les tables et colonnes gardent les noms de FluxBB 1.5 (sans préfixe), pour que le code des
-- repositories reste lisible à côté du PHP d'origine ; ce qui ne sert plus à AvroBB est retiré
-- (mots de passe, activation par e-mail, PunBalise, contacts et listes d'envoi, barre d'outils,
-- Uploadile, biographie, émoticônes en table). Dates en secondes Unix (INTEGER), booléens en 0/1.
--
-- Identifiants AUTOINCREMENT : jamais réutilisés après une suppression (des liens et des
-- notifications peuvent encore viser un ancien message). Pseudos comparés sans tenir compte de la
-- casse (COLLATE NOCASE, lettres ASCII), comme sous MySQL.

CREATE TABLE groups (
	g_id INTEGER PRIMARY KEY AUTOINCREMENT,
	g_title TEXT NOT NULL DEFAULT '',
	g_user_title TEXT,
	g_promote_min_posts INTEGER NOT NULL DEFAULT 0,
	g_promote_next_group INTEGER NOT NULL DEFAULT 0,
	g_moderator INTEGER NOT NULL DEFAULT 0,
	g_mod_edit_users INTEGER NOT NULL DEFAULT 0,
	g_mod_rename_users INTEGER NOT NULL DEFAULT 0,
	g_mod_change_passwords INTEGER NOT NULL DEFAULT 0,
	g_mod_ban_users INTEGER NOT NULL DEFAULT 0,
	g_mod_promote_users INTEGER NOT NULL DEFAULT 0,
	g_read_board INTEGER NOT NULL DEFAULT 1,
	g_view_users INTEGER NOT NULL DEFAULT 1,
	g_post_replies INTEGER NOT NULL DEFAULT 1,
	g_post_topics INTEGER NOT NULL DEFAULT 1,
	g_edit_posts INTEGER NOT NULL DEFAULT 1,
	g_delete_posts INTEGER NOT NULL DEFAULT 1,
	g_delete_topics INTEGER NOT NULL DEFAULT 1,
	g_post_links INTEGER NOT NULL DEFAULT 1,
	g_set_title INTEGER NOT NULL DEFAULT 1,
	g_search INTEGER NOT NULL DEFAULT 1,
	g_search_users INTEGER NOT NULL DEFAULT 1,
	g_send_email INTEGER NOT NULL DEFAULT 1,
	g_post_flood INTEGER NOT NULL DEFAULT 30,
	g_search_flood INTEGER NOT NULL DEFAULT 30,
	g_email_flood INTEGER NOT NULL DEFAULT 60,
	g_report_flood INTEGER NOT NULL DEFAULT 60,
	g_pm INTEGER NOT NULL DEFAULT 1,
	g_pm_limit INTEGER NOT NULL DEFAULT 0,
	g_rep_enable INTEGER NOT NULL DEFAULT 1,
	g_rep_plus_min INTEGER NOT NULL DEFAULT 0,
	g_rep_minus_min INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	group_id INTEGER NOT NULL DEFAULT 4,
	username TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
	email TEXT NOT NULL DEFAULT '',
	-- Compte SSO (lot 5) : fournisseur (« github », « google ») et identifiant chez lui.
	provider TEXT,
	provider_id TEXT,
	-- Incrémenté pour déconnecter le membre de partout (signé dans le cookie de session).
	session_version INTEGER NOT NULL DEFAULT 0,
	title TEXT,
	realname TEXT,
	url TEXT,
	jabber TEXT,
	icq TEXT,
	msn TEXT,
	aim TEXT,
	yahoo TEXT,
	location TEXT,
	signature TEXT,
	disp_topics INTEGER,
	disp_posts INTEGER,
	email_setting INTEGER NOT NULL DEFAULT 1,
	notify_with_post INTEGER NOT NULL DEFAULT 0,
	auto_notify INTEGER NOT NULL DEFAULT 0,
	show_smilies INTEGER NOT NULL DEFAULT 1,
	show_img INTEGER NOT NULL DEFAULT 1,
	show_img_sig INTEGER NOT NULL DEFAULT 1,
	show_avatars INTEGER NOT NULL DEFAULT 1,
	show_sig INTEGER NOT NULL DEFAULT 1,
	timezone REAL NOT NULL DEFAULT 0,
	dst INTEGER NOT NULL DEFAULT 0,
	time_format INTEGER NOT NULL DEFAULT 0,
	date_format INTEGER NOT NULL DEFAULT 0,
	language TEXT NOT NULL DEFAULT 'French',
	style TEXT NOT NULL DEFAULT 'Air',
	num_posts INTEGER NOT NULL DEFAULT 0,
	last_post INTEGER,
	last_search INTEGER,
	last_email_sent INTEGER,
	last_report_sent INTEGER,
	registered INTEGER NOT NULL DEFAULT 0,
	registration_ip TEXT NOT NULL DEFAULT '0.0.0.0',
	last_visit INTEGER NOT NULL DEFAULT 0,
	admin_note TEXT,
	use_pm INTEGER NOT NULL DEFAULT 1,
	notify_pm INTEGER NOT NULL DEFAULT 1,
	notify_pm_full INTEGER NOT NULL DEFAULT 0,
	num_pms INTEGER NOT NULL DEFAULT 0,
	rep_plus INTEGER NOT NULL DEFAULT 0,
	rep_minus INTEGER NOT NULL DEFAULT 0,
	reputation_enable INTEGER NOT NULL DEFAULT 1,
	use_avatar INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX users_username_idx ON users (username);
CREATE UNIQUE INDEX users_provider_idx ON users (provider, provider_id) WHERE provider IS NOT NULL;
CREATE INDEX users_registered_idx ON users (registered);

CREATE TABLE bans (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT COLLATE NOCASE,
	ip TEXT,
	email TEXT,
	message TEXT,
	expire INTEGER,
	ban_creator INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bans_username_idx ON bans (username);

CREATE TABLE categories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	cat_name TEXT NOT NULL DEFAULT 'Nouvelle catégorie',
	disp_position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE censoring (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	search_for TEXT NOT NULL DEFAULT '',
	replace_with TEXT NOT NULL DEFAULT ''
);

CREATE TABLE config (
	conf_name TEXT PRIMARY KEY,
	conf_value TEXT
);

CREATE TABLE forums (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	forum_name TEXT NOT NULL DEFAULT 'Nouveau forum',
	forum_desc TEXT,
	redirect_url TEXT,
	-- Modérateurs du forum : objet JSON { pseudo : id }.
	moderators TEXT,
	num_topics INTEGER NOT NULL DEFAULT 0,
	num_posts INTEGER NOT NULL DEFAULT 0,
	last_post INTEGER,
	last_post_id INTEGER,
	last_poster TEXT,
	sort_by INTEGER NOT NULL DEFAULT 0,
	disp_position INTEGER NOT NULL DEFAULT 0,
	cat_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE forum_perms (
	group_id INTEGER NOT NULL DEFAULT 0,
	forum_id INTEGER NOT NULL DEFAULT 0,
	read_forum INTEGER NOT NULL DEFAULT 1,
	post_replies INTEGER NOT NULL DEFAULT 1,
	post_topics INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY (group_id, forum_id)
);

CREATE TABLE forum_subscriptions (
	user_id INTEGER NOT NULL DEFAULT 0,
	forum_id INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, forum_id)
);

CREATE TABLE topics (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	poster TEXT NOT NULL DEFAULT '',
	subject TEXT NOT NULL DEFAULT '',
	posted INTEGER NOT NULL DEFAULT 0,
	first_post_id INTEGER NOT NULL DEFAULT 0,
	last_post INTEGER NOT NULL DEFAULT 0,
	last_post_id INTEGER NOT NULL DEFAULT 0,
	last_poster TEXT,
	num_views INTEGER NOT NULL DEFAULT 0,
	num_replies INTEGER NOT NULL DEFAULT 0,
	closed INTEGER NOT NULL DEFAULT 0,
	sticky INTEGER NOT NULL DEFAULT 0,
	moved_to INTEGER,
	forum_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX topics_forum_id_idx ON topics (forum_id);
CREATE INDEX topics_moved_to_idx ON topics (moved_to);
CREATE INDEX topics_last_post_idx ON topics (last_post);
CREATE INDEX topics_first_post_id_idx ON topics (first_post_id);

CREATE TABLE posts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	poster TEXT NOT NULL DEFAULT '',
	poster_id INTEGER NOT NULL DEFAULT 1,
	poster_ip TEXT,
	poster_email TEXT,
	message TEXT,
	hide_smilies INTEGER NOT NULL DEFAULT 0,
	posted INTEGER NOT NULL DEFAULT 0,
	edited INTEGER,
	edited_by TEXT,
	topic_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX posts_topic_id_idx ON posts (topic_id);
CREATE INDEX posts_multi_idx ON posts (poster_id, topic_id);

CREATE TABLE topic_subscriptions (
	user_id INTEGER NOT NULL DEFAULT 0,
	topic_id INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE online (
	user_id INTEGER NOT NULL DEFAULT 1,
	ident TEXT NOT NULL DEFAULT '',
	logged INTEGER NOT NULL DEFAULT 0,
	idle INTEGER NOT NULL DEFAULT 0,
	last_post INTEGER,
	last_search INTEGER
);
CREATE UNIQUE INDEX online_user_id_ident_idx ON online (user_id, ident);
CREATE INDEX online_ident_idx ON online (ident);
CREATE INDEX online_logged_idx ON online (logged);

CREATE TABLE reports (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	post_id INTEGER NOT NULL DEFAULT 0,
	topic_id INTEGER NOT NULL DEFAULT 0,
	forum_id INTEGER NOT NULL DEFAULT 0,
	reported_by INTEGER NOT NULL DEFAULT 0,
	created INTEGER NOT NULL DEFAULT 0,
	message TEXT,
	zapped INTEGER,
	zapped_by INTEGER
);
CREATE INDEX reports_zapped_idx ON reports (zapped);

-- Index de recherche de FluxBB : un mot par ligne, et ses occurrences par message.
CREATE TABLE search_words (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	word TEXT NOT NULL UNIQUE
);

CREATE TABLE search_matches (
	post_id INTEGER NOT NULL DEFAULT 0,
	word_id INTEGER NOT NULL DEFAULT 0,
	subject_match INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX search_matches_word_id_idx ON search_matches (word_id);
CREATE INDEX search_matches_post_id_idx ON search_matches (post_id);

CREATE TABLE search_cache (
	id INTEGER PRIMARY KEY,
	ident TEXT NOT NULL DEFAULT '',
	search_data TEXT
);
CREATE INDEX search_cache_ident_idx ON search_cache (ident);

-- Messagerie privée : un exemplaire par détenteur (owner), réunis par shared_id.
CREATE TABLE messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	shared_id INTEGER NOT NULL DEFAULT 0,
	last_shared_id INTEGER NOT NULL DEFAULT 0,
	last_post_id INTEGER NOT NULL DEFAULT 0,
	owner INTEGER NOT NULL DEFAULT 0,
	subject TEXT NOT NULL DEFAULT '',
	message TEXT,
	sender TEXT NOT NULL DEFAULT '',
	receiver TEXT NOT NULL DEFAULT '',
	sender_id INTEGER NOT NULL DEFAULT 0,
	receiver_id TEXT NOT NULL DEFAULT '',
	sender_ip TEXT NOT NULL DEFAULT '',
	hide_smilies INTEGER NOT NULL DEFAULT 0,
	posted INTEGER NOT NULL DEFAULT 0,
	last_post INTEGER NOT NULL DEFAULT 0,
	last_poster TEXT NOT NULL DEFAULT '',
	showed INTEGER NOT NULL DEFAULT 0,
	show_message INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX messages_owner_idx ON messages (owner);
CREATE INDEX messages_shared_id_idx ON messages (shared_id);

CREATE TABLE gallery (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	titre TEXT NOT NULL DEFAULT '',
	user_id INTEGER NOT NULL DEFAULT 0,
	description TEXT,
	date_ajout INTEGER NOT NULL DEFAULT 0,
	ext TEXT NOT NULL DEFAULT ''
);
CREATE INDEX gallery_user_id_idx ON gallery (user_id);

-- Brouillons : sujet renseigné et topic_id 0 pour une nouvelle discussion.
CREATE TABLE brouillons (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	poster TEXT NOT NULL DEFAULT '',
	poster_id INTEGER NOT NULL DEFAULT 1,
	subject TEXT,
	message TEXT,
	posted INTEGER NOT NULL DEFAULT 0,
	topic_id INTEGER NOT NULL DEFAULT 0,
	forum_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX brouillons_poster_id_idx ON brouillons (poster_id);

CREATE TABLE reputation (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL DEFAULT 0,
	from_user_id INTEGER NOT NULL DEFAULT 0,
	time INTEGER NOT NULL DEFAULT 0,
	post_id INTEGER NOT NULL DEFAULT 0,
	reason TEXT,
	topics_id INTEGER NOT NULL DEFAULT 0,
	rep_plus INTEGER NOT NULL DEFAULT 0,
	rep_minus INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX reputation_user_id_idx ON reputation (user_id);
CREATE INDEX reputation_from_user_id_idx ON reputation (from_user_id);
