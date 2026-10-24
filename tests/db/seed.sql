-- Jeu de données fixe des tests d'intégration (tests/db/*.test.ts). Horodatages autour de 1 782 900 000.
-- Mots de passe : SHA-1 de « motdepasse » pour tous les membres.

INSERT INTO fo_config (conf_name, conf_value) VALUES
	('o_board_title', 'Forum de test'),
	('o_default_style', 'Air'),
	('o_disp_posts_default', '2'),
	('o_date_format', 'Y-m-d'),
	('o_time_format', 'H:i'),
	('o_show_user_info', '1'),
	('o_show_post_count', '1'),
	('o_quickjump', '1'),
	('o_feed_type', '2'),
	('o_report_method', '0'),
	('o_pms_enabled', '1'),
	('o_smtp_host', NULL),
	('p_message_bbcode', '1'),
	('p_message_img_tag', '1');

INSERT INTO fo_groups (g_id, g_title, g_user_title, g_moderator, g_read_board, g_view_users, g_search, g_pm, g_pm_limit) VALUES
	(1, 'Administrateurs', 'Administrateur', 0, 1, 1, 1, 1, 0),
	(2, 'Modérateurs', 'Modérateur', 1, 1, 1, 1, 1, 0),
	(3, 'Invités', NULL, 0, 1, 1, 1, 0, 0),
	(4, 'Membres', NULL, 0, 1, 1, 1, 1, 20);

INSERT INTO fo_users (id, group_id, username, password, email, title, location, style, num_posts, registered, last_visit, disp_posts, use_pm, num_pms) VALUES
	(1, 3, 'Invité', 'Invité', '', NULL, NULL, 'Air', 0, 0, 0, NULL, 0, 0),
	(2, 1, 'admin', 'b9b7c1e5e7fb7a6e2b0c1a9ce4a5c9d2d6e0b6a1', 'admin@example.test', NULL, NULL, 'Air', 1, 1782000000, 1782890000, NULL, 1, 0),
	(3, 4, 'Tessy', 'b9b7c1e5e7fb7a6e2b0c1a9ce4a5c9d2d6e0b6a1', 'tessy@example.test', 'Pilote de ligne', 'Hyères', 'GreenDark', 2, 1782100000, 1782895000, 1, 1, 5),
	(5, 2, 'MaxDUO', 'b9b7c1e5e7fb7a6e2b0c1a9ce4a5c9d2d6e0b6a1', 'max@example.test', NULL, NULL, 'Inconnu', 1, 1782200000, 1782896000, NULL, 1, 0);

INSERT INTO fo_categories (id, cat_name, disp_position) VALUES
	(1, 'Simulateurs', 2),
	(2, 'Ateliers & Médias', 1);

-- Forum 3 : interdit en lecture aux invités. Forum 4 : redirection.
INSERT INTO fo_forums (id, forum_name, cat_id, disp_position, moderators, redirect_url) VALUES
	(1, 'Technique', 1, 1, NULL, NULL),
	(2, 'Captures d''écran & Vidéos', 2, 1, 'a:1:{s:6:"MaxDUO";i:5;}', NULL),
	(3, 'Équipe', 1, 2, NULL, NULL),
	(4, 'Site officiel', 1, 3, NULL, 'https://example.test');

INSERT INTO fo_forum_perms (group_id, forum_id, read_forum, post_replies, post_topics) VALUES
	(3, 3, 0, 0, 0),
	(4, 2, 1, 0, 1);

INSERT INTO fo_topics (id, poster, subject, posted, first_post_id, last_post, last_post_id, last_poster, num_replies, closed, sticky, moved_to, forum_id) VALUES
	(10, 'Tessy', 'Postez un « vintage »', 1782800000, 100, 1782800200, 102, 'admin', 2, 0, 0, NULL, 2),
	(11, 'admin', 'Réservé à l''équipe', 1782800000, 110, 1782800000, 110, 'admin', 0, 0, 0, NULL, 3),
	(12, 'Tessy', 'Postez un « vintage »', 1782800000, 100, 1782800200, 102, 'admin', 2, 0, 0, 10, 1);

INSERT INTO fo_posts (id, poster, poster_id, poster_ip, message, posted, edited, edited_by, topic_id) VALUES
	(100, 'Tessy', 3, '192.0.2.1', 'Premier message [b]gras[/b]', 1782800000, NULL, NULL, 10),
	(101, 'MaxDUO', 5, '192.0.2.5', 'Deuxième message', 1782800100, 1782800150, 'MaxDUO', 10),
	(102, 'admin', 2, '192.0.2.2', 'Troisième message', 1782800200, NULL, NULL, 10),
	(110, 'admin', 2, '192.0.2.2', 'Message interne', 1782800000, NULL, NULL, 11);

INSERT INTO fo_online (user_id, ident, logged, idle) VALUES
	(3, 'Tessy', 1782899000, 0),
	(5, 'MaxDUO', 1782899000, 1),
	(1, '192.0.2.9', 1782899000, 0);

INSERT INTO fo_reports (post_id, topic_id, forum_id, reported_by, created, message, zapped, zapped_by) VALUES
	(101, 10, 2, 3, 1782800300, 'Hors sujet', 1782800400, 2),
	(102, 10, 2, 3, 1782800500, 'Doublon', NULL, NULL);

INSERT INTO fo_messages (shared_id, owner, subject, showed, show_message) VALUES
	(1, 3, 'Bonjour', 0, 1),
	(2, 3, 'Relance', 0, 1),
	(3, 3, 'Lu', 1, 1),
	(4, 3, 'Supprimé', 0, 0),
	(1, 2, 'Bonjour', 0, 1);

-- Balises PV : « [Réglé] » et « #En cours# » posées sur le sujet 10, aucune sur le 11.
ALTER TABLE fo_balises_modo ADD COLUMN bal3 tinyint(1) NOT NULL DEFAULT 0;
INSERT INTO fo_balises (id, nom, couleur, gras, ital, souli, position, baltype, affich) VALUES
	(1, 'Réglé', '#00AA00', 1, 0, 0, 2, 0, 1),
	(2, 'En cours', '#FF9900', 0, 1, 0, 1, 2, 1),
	(3, 'Archivé', '#999999', 0, 0, 0, 3, 1, 1);
INSERT INTO fo_balises_modo (npost, bal1, bal2, bal3) VALUES ('10', 1, 1, 0), ('11', 0, 0, 0);

INSERT INTO fo_bans (username, ip, email, message, expire, ban_creator) VALUES
	('MaxDUO', NULL, NULL, NULL, 1700000000, 2),
	(NULL, '192.0.2.66', NULL, NULL, NULL, 2);

INSERT INTO fo_censoring (search_for, replace_with) VALUES ('zut', '***'), ('flûte*', '[censuré]');
