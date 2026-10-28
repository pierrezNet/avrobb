/**
 * Conversion des options brutes du forum (table config ou cache_config.php, clés o_* et p_*)
 * en réglages typés du domaine. Fonction pure : la source des valeurs est choisie ailleurs
 * (repositories/ConfigLoader.ts).
 */

import type { BoardConfig, FeedType } from '../domain/models.ts';
import { parseSubjectTags, SUBJECT_TAGS_KEY } from './subjectTagConfig.ts';

const FEED_TYPES: Readonly<Record<string, FeedType>> = { '1': 'rss', '2': 'atom' };

export function toBoardConfig(values: ReadonlyMap<string, string>): BoardConfig {
	const text = (name: string, fallback = ''): string => values.get(name) ?? fallback;
	const flag = (name: string): boolean => values.get(name) === '1';
	const reportMethod = text('o_report_method', '0');
	const int = (name: string, fallback: number): number => {
		const raw = values.get(name);
		return raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
	};

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
		avatarMaxWidth: int('o_avatars_width', 60),
		avatarMaxHeight: int('o_avatars_height', 60),
		avatarMaxBytes: int('o_avatars_size', 10240),
		bbcode: flag('p_message_bbcode'),
		imgTag: flag('p_message_img_tag'),
		rules: flag('o_rules'),
		registrationsAllowed: flag('o_regs_allow'),
		additionalNavlinks: text('o_additional_navlinks'),
		// header.php : 0 = forum seulement, 1 = e-mail seulement, 2 = les deux.
		reportsByBoard: reportMethod === '0' || reportMethod === '2',
		reportsByEmail: reportMethod === '1' || reportMethod === '2',
		maintenance: flag('o_maintenance'),
		maintenanceMessage: text('o_maintenance_message'),
		timeoutVisit: Number(text('o_timeout_visit', '1800')) || 1800,
		timeoutOnline: Number(text('o_timeout_online', '300')) || 300,
		adminEmail: text('o_admin_email'),
		webmasterEmail: text('o_webmaster_email'),
		smtp: { host: text('o_smtp_host'), user: text('o_smtp_user'), pass: text('o_smtp_pass'), ssl: flag('o_smtp_ssl') },
		defaultUserGroup: Number(text('o_default_user_group', '4')) || 4,
		registration: {
			verify: flag('o_regs_verify'),
			report: flag('o_regs_report'),
			mailingList: text('o_mailing_list'),
			allowBannedEmail: flag('p_allow_banned_email'),
			allowDupeEmail: flag('p_allow_dupe_email'),
			defaultEmailSetting: Number(text('o_default_email_setting', '1')),
			defaultTimezone: Number(text('o_default_timezone', '0')),
			defaultDst: flag('o_default_dst'),
			defaultLang: text('o_default_lang', 'French'),
		},
		posting: {
			topicReview: Number(text('o_topic_review', '15')) || 0,
			quoteDepth: Number(text('o_quote_depth', '3')) || 0,
			makeLinks: flag('o_make_links'),
			subjectAllCaps: flag('p_subject_all_caps'),
			messageAllCaps: flag('p_message_all_caps'),
			forceGuestEmail: flag('p_force_guest_email'),
			quickpost: flag('o_quickpost'),
		},
		announcement: flag('o_announcement') ? text('o_announcement_message') : null,
		quickjump: flag('o_quickjump'),
		feedType: FEED_TYPES[text('o_feed_type')] ?? 'none',
		privateMessagesEnabled: flag('o_pms_enabled'),
		smilies: flag('o_smilies'),
		signatureSmilies: flag('o_smilies_sig'),
		censoring: flag('o_censoring'),
		signatureBbcode: flag('p_sig_bbcode'),
		signatureImgTag: flag('p_sig_img_tag'),
		signatureMaxLength: int('p_sig_length', 400),
		signatureMaxLines: int('p_sig_lines', 4),
		signatureAllCaps: flag('p_sig_all_caps'),
		plugileMenuName: flag('o_plugile_menu') ? text('o_plugile_menu_name') : null,
		subjectTags: parseSubjectTags(values.get(SUBJECT_TAGS_KEY)),
		privateMessageNotification: flag('o_pms_notification'),
		privateMessageMaxReceivers: int('o_pms_max_receiver', 5),
		privateMessagesPerPage: Math.max(1, int('o_pms_mess_per_page', 15)),
		uploads: {
			extensions: text('o_uploadile_laws')
				.split(',')
				.map((ext) => ext.trim().toLowerCase())
				.filter((ext) => ext !== ''),
			memberQuota: int('o_uploadile_limit_member', 0),
			moderatorQuota: int('o_uploadile_limit_modo', 0),
			memberMaxFileSize: int('o_uploadile_maxsize_member', 0),
			moderatorMaxFileSize: int('o_uploadile_maxsize_modo', 0),
			thumbnails: flag('o_uploadile_thumb'),
			thumbnailSize: Math.max(16, int('o_uploadile_thumb_size', 100)),
		},
		baseUrl: text('o_base_url').replace(/\/$/, ''),
		indentSpaces: Number(text('o_indent_num_spaces', '4')) || 0,
		reputationEnabled: flag('o_reputation_enabled'),
		reputationTimeout: int('o_reputation_timeout', 0),
		usersOnline: flag('o_users_online'),
	};
}
