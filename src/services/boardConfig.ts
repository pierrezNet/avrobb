/**
 * Conversion des options brutes du forum (table config ou cache_config.php, clés o_* et p_*)
 * en réglages typés du domaine. Fonction pure : la source des valeurs est choisie ailleurs
 * (repositories/ConfigLoader.ts).
 */

import type { BoardConfig, FeedType } from '../domain/models.ts';

const FEED_TYPES: Readonly<Record<string, FeedType>> = { '1': 'rss', '2': 'atom' };

export function toBoardConfig(values: ReadonlyMap<string, string>): BoardConfig {
	const text = (name: string, fallback = ''): string => values.get(name) ?? fallback;
	const flag = (name: string): boolean => values.get(name) === '1';
	const reportMethod = text('o_report_method', '0');

	return {
		boardTitle: text('o_board_title'),
		defaultStyle: text('o_default_style', 'Air'),
		defaultPostsPerPage: Number(text('o_disp_posts_default', '25')) || 25,
		defaultTopicsPerPage: Number(text('o_disp_topics_default', '30')) || 30,
		showDot: flag('o_show_dot'),
		forumSubscriptions: flag('o_forum_subscriptions'),
		topicSubscriptions: flag('o_topic_subscriptions'),
		topicViews: flag('o_topic_views'),
		rulesMessage: text('o_rules_message'),
		searchAllForums: flag('o_search_all_forums'),
		dateFormat: text('o_date_format', 'Y-m-d'),
		timeFormat: text('o_time_format', 'H:i:s'),
		showUserInfo: flag('o_show_user_info'),
		showPostCount: flag('o_show_post_count'),
		signatures: flag('o_signatures'),
		avatars: flag('o_avatars'),
		avatarsDir: text('o_avatars_dir', 'img/avatars'),
		bbcode: flag('p_message_bbcode'),
		imgTag: flag('p_message_img_tag'),
		rules: flag('o_rules'),
		registrationsAllowed: flag('o_regs_allow'),
		additionalNavlinks: text('o_additional_navlinks'),
		// header.php : 0 = forum seulement, 1 = e-mail seulement, 2 = les deux.
		reportsByBoard: reportMethod === '0' || reportMethod === '2',
		maintenance: flag('o_maintenance'),
		maintenanceMessage: text('o_maintenance_message'),
		timeoutVisit: Number(text('o_timeout_visit', '1800')) || 1800,
		timeoutOnline: Number(text('o_timeout_online', '300')) || 300,
		adminEmail: text('o_admin_email'),
		webmasterEmail: text('o_webmaster_email'),
		smtp: { host: text('o_smtp_host'), user: text('o_smtp_user'), pass: text('o_smtp_pass'), ssl: flag('o_smtp_ssl') },
		defaultUserGroup: Number(text('o_default_user_group', '4')) || 4,
		announcement: flag('o_announcement') ? text('o_announcement_message') : null,
		quickjump: flag('o_quickjump'),
		feedType: FEED_TYPES[text('o_feed_type')] ?? 'none',
		shownVersion: flag('o_show_version') ? text('o_cur_version') : null,
		privateMessagesEnabled: flag('o_pms_enabled'),
		smilies: flag('o_smilies'),
		signatureSmilies: flag('o_smilies_sig'),
		censoring: flag('o_censoring'),
		signatureBbcode: flag('p_sig_bbcode'),
		signatureImgTag: flag('p_sig_img_tag'),
		baseUrl: text('o_base_url').replace(/\/$/, ''),
		indentSpaces: Number(text('o_indent_num_spaces', '4')) || 0,
		reputationEnabled: flag('o_reputation_enabled'),
		usersOnline: flag('o_users_online'),
	};
}
