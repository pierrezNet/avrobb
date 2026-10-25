-- Schéma FluxBB 1.5 de Pilote-Virtuel (préfixe fo_), structure seule, exporté de la base locale pv_db :
--   docker exec pv_db mariadb-dump --no-data --skip-comments pilotevirtuel
-- À régénérer si le schéma de production évolue. Sert à créer la base de test (tests/db/globalSetup.ts).

CREATE TABLE `fo_balises` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `nom` varchar(50) NOT NULL DEFAULT '',
  `couleur` varchar(50) NOT NULL DEFAULT '',
  `gras` int(10) NOT NULL DEFAULT 0,
  `ital` int(10) NOT NULL DEFAULT 0,
  `souli` int(10) NOT NULL DEFAULT 0,
  `position` int(10) NOT NULL DEFAULT 0,
  `baltype` int(10) NOT NULL DEFAULT 0,
  `affich` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_balises_modo` (
  `npost` varchar(10) NOT NULL DEFAULT '',
  `bal1` tinyint(1) NOT NULL DEFAULT 0,
  `bal2` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_bans` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(200) DEFAULT NULL,
  `ip` varchar(255) DEFAULT NULL,
  `email` varchar(80) DEFAULT NULL,
  `message` varchar(255) DEFAULT NULL,
  `expire` int(10) unsigned DEFAULT NULL,
  `ban_creator` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fo_bans_username_idx` (`username`(25))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_categories` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `cat_name` varchar(80) NOT NULL DEFAULT 'New Category',
  `disp_position` int(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_censoring` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `search_for` varchar(60) NOT NULL DEFAULT '',
  `replace_with` varchar(60) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_config` (
  `conf_name` varchar(255) NOT NULL DEFAULT '',
  `conf_value` text DEFAULT NULL,
  PRIMARY KEY (`conf_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_forum_perms` (
  `group_id` int(10) NOT NULL DEFAULT 0,
  `forum_id` int(10) NOT NULL DEFAULT 0,
  `read_forum` tinyint(1) NOT NULL DEFAULT 1,
  `post_replies` tinyint(1) NOT NULL DEFAULT 1,
  `post_topics` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`group_id`,`forum_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_forum_subscriptions` (
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `forum_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`forum_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_forums` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `forum_name` varchar(80) NOT NULL DEFAULT 'New forum',
  `forum_desc` text DEFAULT NULL,
  `redirect_url` varchar(100) DEFAULT NULL,
  `moderators` text DEFAULT NULL,
  `num_topics` mediumint(8) unsigned NOT NULL DEFAULT 0,
  `num_posts` mediumint(8) unsigned NOT NULL DEFAULT 0,
  `last_post` int(10) unsigned DEFAULT NULL,
  `last_post_id` int(10) unsigned DEFAULT NULL,
  `last_poster` varchar(200) DEFAULT NULL,
  `sort_by` tinyint(1) NOT NULL DEFAULT 0,
  `disp_position` int(10) NOT NULL DEFAULT 0,
  `cat_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_groups` (
  `g_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `g_title` varchar(50) NOT NULL DEFAULT '',
  `g_user_title` varchar(50) DEFAULT NULL,
  `g_promote_min_posts` int(10) unsigned NOT NULL DEFAULT 0,
  `g_promote_next_group` int(10) unsigned NOT NULL DEFAULT 0,
  `g_moderator` tinyint(1) NOT NULL DEFAULT 0,
  `g_mod_edit_users` tinyint(1) NOT NULL DEFAULT 0,
  `g_mod_rename_users` tinyint(1) NOT NULL DEFAULT 0,
  `g_mod_change_passwords` tinyint(1) NOT NULL DEFAULT 0,
  `g_mod_ban_users` tinyint(1) NOT NULL DEFAULT 0,
  `g_mod_promote_users` tinyint(1) NOT NULL DEFAULT 0,
  `g_read_board` tinyint(1) NOT NULL DEFAULT 1,
  `g_view_users` tinyint(1) NOT NULL DEFAULT 1,
  `g_post_replies` tinyint(1) NOT NULL DEFAULT 1,
  `g_post_topics` tinyint(1) NOT NULL DEFAULT 1,
  `g_edit_posts` tinyint(1) NOT NULL DEFAULT 1,
  `g_delete_posts` tinyint(1) NOT NULL DEFAULT 1,
  `g_delete_topics` tinyint(1) NOT NULL DEFAULT 1,
  `g_post_links` tinyint(1) NOT NULL DEFAULT 1,
  `g_set_title` tinyint(1) NOT NULL DEFAULT 1,
  `g_search` tinyint(1) NOT NULL DEFAULT 1,
  `g_search_users` tinyint(1) NOT NULL DEFAULT 1,
  `g_send_email` tinyint(1) NOT NULL DEFAULT 1,
  `g_post_flood` smallint(6) NOT NULL DEFAULT 30,
  `g_search_flood` smallint(6) NOT NULL DEFAULT 30,
  `g_email_flood` smallint(6) NOT NULL DEFAULT 60,
  `g_report_flood` smallint(6) NOT NULL DEFAULT 60,
  `g_pm` tinyint(1) NOT NULL DEFAULT 1,
  `g_pm_limit` int(10) NOT NULL DEFAULT 0,
  `g_rep_enable` tinyint(1) NOT NULL DEFAULT 1,
  `g_rep_plus_min` int(10) NOT NULL DEFAULT 0,
  `g_rep_minus_min` int(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (`g_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_online` (
  `user_id` int(10) unsigned NOT NULL DEFAULT 1,
  `ident` varchar(200) NOT NULL DEFAULT '',
  `logged` int(10) unsigned NOT NULL DEFAULT 0,
  `idle` tinyint(1) NOT NULL DEFAULT 0,
  `last_post` int(10) unsigned DEFAULT NULL,
  `last_search` int(10) unsigned DEFAULT NULL,
  UNIQUE KEY `fo_online_user_id_ident_idx` (`user_id`,`ident`(25)),
  KEY `fo_online_ident_idx` (`ident`(25)),
  KEY `fo_online_logged_idx` (`logged`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_posts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `poster` varchar(200) NOT NULL DEFAULT '',
  `poster_id` int(10) unsigned NOT NULL DEFAULT 1,
  `poster_ip` varchar(39) DEFAULT NULL,
  `poster_email` varchar(80) DEFAULT NULL,
  `message` mediumtext DEFAULT NULL,
  `hide_smilies` tinyint(1) NOT NULL DEFAULT 0,
  `posted` int(10) unsigned NOT NULL DEFAULT 0,
  `edited` int(10) unsigned DEFAULT NULL,
  `edited_by` varchar(200) DEFAULT NULL,
  `topic_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fo_posts_topic_id_idx` (`topic_id`),
  KEY `fo_posts_multi_idx` (`poster_id`,`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_reports` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `topic_id` int(10) unsigned NOT NULL DEFAULT 0,
  `forum_id` int(10) unsigned NOT NULL DEFAULT 0,
  `reported_by` int(10) unsigned NOT NULL DEFAULT 0,
  `created` int(10) unsigned NOT NULL DEFAULT 0,
  `message` text DEFAULT NULL,
  `zapped` int(10) unsigned DEFAULT NULL,
  `zapped_by` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fo_reports_zapped_idx` (`zapped`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_search_cache` (
  `id` int(10) unsigned NOT NULL DEFAULT 0,
  `ident` varchar(200) NOT NULL DEFAULT '',
  `search_data` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fo_search_cache_ident_idx` (`ident`(8))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_search_matches` (
  `post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `word_id` int(10) unsigned NOT NULL DEFAULT 0,
  `subject_match` tinyint(1) NOT NULL DEFAULT 0,
  KEY `fo_search_matches_word_id_idx` (`word_id`),
  KEY `fo_search_matches_post_id_idx` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_search_words` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `word` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '',
  PRIMARY KEY (`word`),
  KEY `fo_search_words_id_idx` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_smilies` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `image` varchar(40) NOT NULL DEFAULT '',
  `text` varchar(20) NOT NULL DEFAULT '',
  `disp_position` int(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_toolbar_conf` (
  `conf_name` varchar(255) NOT NULL DEFAULT '',
  `conf_value` text DEFAULT NULL,
  PRIMARY KEY (`conf_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_toolbar_tags` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL DEFAULT '',
  `code` varchar(50) NOT NULL DEFAULT '',
  `enable_form` tinyint(1) NOT NULL DEFAULT 1,
  `enable_quick` tinyint(1) NOT NULL DEFAULT 1,
  `image` varchar(100) NOT NULL DEFAULT '',
  `func` text DEFAULT NULL,
  `position` int(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_topic_subscriptions` (
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `topic_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_topics` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `poster` varchar(200) NOT NULL DEFAULT '',
  `subject` varchar(255) NOT NULL DEFAULT '',
  `posted` int(10) unsigned NOT NULL DEFAULT 0,
  `first_post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `last_post` int(10) unsigned NOT NULL DEFAULT 0,
  `last_post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `last_poster` varchar(200) DEFAULT NULL,
  `num_views` mediumint(8) unsigned NOT NULL DEFAULT 0,
  `num_replies` mediumint(8) unsigned NOT NULL DEFAULT 0,
  `closed` tinyint(1) NOT NULL DEFAULT 0,
  `sticky` tinyint(1) NOT NULL DEFAULT 0,
  `moved_to` int(10) unsigned DEFAULT NULL,
  `forum_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fo_topics_forum_id_idx` (`forum_id`),
  KEY `fo_topics_moved_to_idx` (`moved_to`),
  KEY `fo_topics_last_post_idx` (`last_post`),
  KEY `fo_topics_first_post_id_idx` (`first_post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE `fo_users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int(10) unsigned NOT NULL DEFAULT 3,
  `username` varchar(200) NOT NULL DEFAULT '',
  `password` varchar(255) NOT NULL DEFAULT '',
  `email` varchar(80) NOT NULL DEFAULT '',
  `title` varchar(50) DEFAULT NULL,
  `realname` varchar(40) DEFAULT NULL,
  `url` varchar(100) DEFAULT NULL,
  `jabber` varchar(80) DEFAULT NULL,
  `icq` varchar(12) DEFAULT NULL,
  `msn` varchar(80) DEFAULT NULL,
  `yahoo` varchar(30) DEFAULT NULL,
  `location` varchar(30) DEFAULT NULL,
  `signature` text DEFAULT NULL,
  `disp_topics` tinyint(3) unsigned DEFAULT NULL,
  `disp_posts` tinyint(3) unsigned DEFAULT NULL,
  `email_setting` tinyint(1) NOT NULL DEFAULT 1,
  `notify_with_post` tinyint(1) NOT NULL DEFAULT 0,
  `auto_notify` tinyint(1) NOT NULL DEFAULT 0,
  `show_smilies` tinyint(1) NOT NULL DEFAULT 1,
  `show_img` tinyint(1) NOT NULL DEFAULT 1,
  `show_img_sig` tinyint(1) NOT NULL DEFAULT 1,
  `show_avatars` tinyint(1) NOT NULL DEFAULT 1,
  `show_sig` tinyint(1) NOT NULL DEFAULT 1,
  `timezone` float NOT NULL DEFAULT 0,
  `dst` tinyint(1) NOT NULL DEFAULT 0,
  `time_format` tinyint(1) NOT NULL DEFAULT 0,
  `date_format` tinyint(1) NOT NULL DEFAULT 0,
  `language` varchar(25) NOT NULL DEFAULT 'French',
  `style` varchar(25) NOT NULL DEFAULT 'Air',
  `num_posts` int(10) unsigned NOT NULL DEFAULT 0,
  `last_post` int(10) unsigned DEFAULT NULL,
  `last_search` int(10) unsigned DEFAULT NULL,
  `last_email_sent` int(10) unsigned DEFAULT NULL,
  `last_report_sent` int(10) unsigned DEFAULT NULL,
  `registered` int(10) unsigned NOT NULL DEFAULT 0,
  `registration_ip` varchar(39) NOT NULL DEFAULT '0.0.0.0',
  `last_visit` int(10) unsigned NOT NULL DEFAULT 0,
  `admin_note` varchar(30) DEFAULT NULL,
  `activate_string` varchar(80) DEFAULT NULL,
  `activate_key` varchar(8) DEFAULT NULL,
  `aim` varchar(30) DEFAULT NULL,
  `biographie` text DEFAULT NULL,
  `use_pm` tinyint(1) NOT NULL DEFAULT 1,
  `notify_pm` tinyint(1) NOT NULL DEFAULT 1,
  `notify_pm_full` tinyint(1) NOT NULL DEFAULT 0,
  `num_pms` int(10) unsigned NOT NULL DEFAULT 0,
  `rep_plus` int(10) NOT NULL DEFAULT 0,
  `rep_minus` int(10) NOT NULL DEFAULT 0,
  `reputation_enable` tinyint(1) NOT NULL DEFAULT 1,
  `use_avatar` tinyint(1) NOT NULL DEFAULT 1,
  `upload` bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fo_users_username_idx` (`username`(25)),
  KEY `fo_users_registered_idx` (`registered`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;



-- Messagerie privée du mod APMS (messages, contacts, listes d'envoi) : absente de la base locale,
-- reconstituée d'après les requêtes de plugins/apms/*.php et pms_*.php.
CREATE TABLE `fo_messages` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `shared_id` int(10) unsigned NOT NULL DEFAULT 0,
  `last_shared_id` int(10) unsigned NOT NULL DEFAULT 0,
  `last_post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `owner` int(10) unsigned NOT NULL DEFAULT 0,
  `subject` varchar(255) NOT NULL DEFAULT '',
  `message` text DEFAULT NULL,
  `sender` varchar(200) NOT NULL DEFAULT '',
  `receiver` text NOT NULL DEFAULT '',
  `sender_id` int(10) unsigned NOT NULL DEFAULT 0,
  `receiver_id` text NOT NULL DEFAULT '',
  `sender_ip` varchar(39) NOT NULL DEFAULT '',
  `hide_smilies` tinyint(1) NOT NULL DEFAULT 0,
  `posted` int(10) unsigned NOT NULL DEFAULT 0,
  `last_post` int(10) unsigned NOT NULL DEFAULT 0,
  `last_poster` varchar(200) NOT NULL DEFAULT '',
  `showed` tinyint(1) NOT NULL DEFAULT 0,
  `show_message` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `fo_messages_owner_idx` (`owner`),
  KEY `fo_messages_shared_id_idx` (`shared_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `fo_contacts` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `contact_id` int(10) unsigned NOT NULL DEFAULT 0,
  `contact_name` varchar(200) NOT NULL DEFAULT '',
  `allow_msg` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `fo_contacts_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `fo_sending_lists` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `name` varchar(255) NOT NULL DEFAULT '',
  `receivers` text NOT NULL,
  `array_id` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fo_sending_lists_user_id_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Galerie de PV : absente de la base locale, reconstituée d'après les requêtes de gallery.php.
CREATE TABLE `fo_gallery` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `titre` varchar(255) NOT NULL DEFAULT '',
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `date_ajout` int(10) unsigned NOT NULL DEFAULT 0,
  `ext` varchar(10) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Brouillons de PV : absents de la base locale, reconstitués d'après post.php, draft_list.php et draft_edit.php.
CREATE TABLE `fo_brouillons` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `poster` varchar(200) NOT NULL DEFAULT '',
  `poster_id` int(10) unsigned NOT NULL DEFAULT 1,
  `subject` varchar(255) DEFAULT NULL,
  `message` mediumtext DEFAULT NULL,
  `posted` int(10) unsigned NOT NULL DEFAULT 0,
  `topic_id` int(10) unsigned NOT NULL DEFAULT 0,
  `forum_id` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fo_brouillons_poster_id_idx` (`poster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Renommée (mod Reputation) : absente de la base locale, reconstituée d'après reputation.php.
CREATE TABLE `fo_reputation` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `from_user_id` int(10) unsigned NOT NULL DEFAULT 0,
  `time` int(10) unsigned NOT NULL DEFAULT 0,
  `post_id` int(10) unsigned NOT NULL DEFAULT 0,
  `reason` text DEFAULT NULL,
  `topics_id` int(10) unsigned NOT NULL DEFAULT 0,
  `rep_plus` tinyint(1) NOT NULL DEFAULT 0,
  `rep_minus` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fo_reputation_user_id_idx` (`user_id`),
  KEY `fo_reputation_from_user_id_idx` (`from_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Premium de PV (premium.php) : tables sans préfixe, absentes de la base locale, reconstituées
-- d'après les requêtes de premium.php.
CREATE TABLE `apremium` (
  `ID_User` int(10) unsigned NOT NULL,
  `Expiration` date NOT NULL,
  `Token` varchar(255) NOT NULL DEFAULT 'default',
  PRIMARY KEY (`ID_User`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `acodes15` (
  `Code` varchar(64) NOT NULL,
  `Used` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `acodes365` (
  `Code` varchar(64) NOT NULL,
  `Used` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`Code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
