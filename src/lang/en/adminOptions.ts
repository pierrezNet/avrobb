/**
 * English translation of src/lang/fr/adminOptions.ts: sections, labels and help texts of the
 * admin_options.php options, validation errors.
 */

import type { adminOptions as frAdminOptions } from '../fr/adminOptions.ts';

export const adminOptions: typeof frAdminOptions = {
	title: 'Options',
	formErrors: 'Errors in the options',
	formErrorsInfo: 'The following errors must be fixed before the options can be saved:',
	sections: {
		essentials: 'Essentials',
		timeouts: 'Timeouts',
		display: 'Display',
		features: 'Features',
		feed: 'Syndication',
		reports: 'Reports',
		avatars: 'Avatars',
		email: 'Email',
		registration: 'Registration',
		announcement: 'Announcements',
	},
	fields: {
		board_title: {
			label: 'Board title',
			help: 'The title of this board (shown at the top of every page). This field may not contain HTML.',
		},
		board_desc: {
			label: 'Board description',
			help: 'A short description of this board (shown at the top of every page). This field may contain HTML.',
		},
		base_url: {
			label: 'Base URL',
			help: 'The full URL of the board without a trailing slash (e.g. http://www.mydomain.com/forums). This must be correct for all administrator and moderator features to work. If you get “Bad referer” errors, it is probably incorrect.',
		},
		default_timezone: {
			label: 'Default time zone',
			help: 'The default time zone for guests and for users registering on the board.',
		},
		default_dst: { label: 'Adjust for DST', help: 'Enable daylight saving time (advance by one hour).' },
		default_style: {
			label: 'Default style',
			help: 'The default style used for guests and for users who have not changed this setting in their profile.',
		},
		timeout_visit: {
			label: 'Visit timeout',
			help: 'Number of seconds a user must be idle before their last visit data is updated (mainly affects new post indicators).',
		},
		timeout_online: {
			label: 'Online timeout',
			help: 'Number of seconds a user must be idle before being removed from the online users list.',
		},
		redirect_delay: {
			label: 'Redirect time',
			help: 'Number of seconds to wait before redirecting. If set to 0, no redirect page is shown (not recommended).',
		},
		show_user_info: {
			label: 'User info in posts',
			help: 'Show information about the poster under their username in topic view. The information shown is: location, registration date, post count and contact links (email and URL).',
		},
		show_post_count: {
			label: 'User post count',
			help: 'Show the number of posts a user has made (in topic view, profile and user list).',
		},
		smilies: { label: 'Smilies in posts', help: 'Convert smilies to small graphic icons.' },
		smilies_sig: {
			label: 'Smilies in signatures',
			help: 'Convert smilies to small graphic icons in user signatures.',
		},
		make_links: {
			label: 'Make clickable links',
			help: 'When enabled, AvroBB will automatically detect URLs in posts and turn them into clickable hyperlinks.',
		},
		topic_review: {
			label: 'Topic review',
			help: 'Maximum number of posts to show when writing a post (newest first). 0 to disable.',
		},
		disp_topics_default: {
			label: 'Topics per page',
			help: 'The default number of topics to show per page in a forum. Users can change this setting.',
		},
		disp_posts_default: {
			label: 'Posts per page',
			help: 'The default number of posts to show per page in a topic. Users can change this setting.',
		},
		indent_num_spaces: {
			label: 'Tab size',
			help: 'If set to 8, a regular tab will be used when displaying text inside a [code][/code] tag. Otherwise, this many spaces will be used to indent the text.',
		},
		quote_depth: {
			label: 'Maximum [quote] depth',
			help: 'The maximum number of times a [quote] tag can be nested inside other [quote] tags; any deeper tags will be discarded.',
		},
		quickpost: {
			label: 'Quick reply',
			help: 'When enabled, AvroBB will add a quick reply form at the bottom of topics, so users can reply directly from the topic view.',
		},
		users_online: {
			label: 'Users online',
			help: 'Show information on the index page about the number of guests and registered users currently browsing the forums.',
		},
		censoring: {
			label: 'Censor words',
			help: 'Enable this to censor specific words on the board. See the “Censoring” section for more information.',
		},
		signatures: { label: 'Signatures', help: 'Allow users to attach a signature to their posts.' },
		show_dot: {
			label: 'User has posted earlier',
			help: 'This feature shows a dot in front of topics in viewforum.php if the currently logged-in user has posted in that topic before. Disable it if you experience high server load.',
		},
		topic_views: {
			label: 'Topic views',
			help: 'Keep track of the number of times a topic has been viewed. Disable it if you experience high server load on a busy forum.',
		},
		quickjump: { label: 'Quick jump', help: 'Enable the quick jump (jump to forum) drop-down list.' },
		search_all_forums: {
			label: 'Search all forums',
			help: 'When disabled, searches can only be run in one forum at a time. Disable it if server load is high due to excessive searching.',
		},
		additional_navlinks: {
			label: 'Additional menu items',
			help: 'By entering HTML hyperlinks into this box, any number of items can be added to the navigation menu at the top of every page. The format for adding new links is X = <a href="URL">LINK</a> where X is the position at which the link should be inserted (e.g. 0 to insert at the beginning and 2 to insert after “User list”). Separate entries with a line break.',
		},
		reputation_enabled: {
			label: 'Reputation',
			help: "Members' “+” and “−” votes on the author of a post, and the score shown under their name. When disabled, neither votes nor scores are shown; votes already cast are kept.",
		},
		post_reactions: {
			label: 'Post reactions',
			help: 'Reactions below posts (👍 Like, ❤️ 😂 😮 😢 🙏 🎉), one per member and post, and the list of members who reacted. This week’s reactions rank the “Most appreciated posts” on the home page. When disabled, nothing is shown; reactions already given are kept.',
		},
		feed_type: {
			label: 'Default feed type',
			help: 'The type of feed subscription to display. Note: choosing “None” does not disable the feed, it only hides it by default.',
		},
		report_method: {
			label: 'Reporting method',
			help: 'Choose how topic/post reports are handled. You can use the internal report system, email the mailing list (see below), or both.',
		},
		mailing_list: {
			label: 'Mailing list',
			help: 'A comma-separated list of subscribers. The people on this list receive reports and feedback from the Phraséo, Donne Ton Point, UTC clock, SELCAL and Settings Workshop apps.',
		},
		phraseo_feedback_target: {
			label: 'Forum for accepted Phraséo feedback',
			help: 'Number of the public forum where the “Accept” button posts feedback from the private “Phraséo feedback (to sort)” forum. 0: button hidden.',
		},
		dtp_feedback_target: {
			label: 'Forum for accepted Donne Ton Point feedback',
			help: 'Number of the public forum where the “Accept” button posts feedback from the private “Donne Ton Point feedback (to sort)” forum. 0: button hidden.',
		},
		utc_feedback_target: {
			label: 'Forum for accepted UTC clock feedback',
			help: 'Number of the public forum where the “Accept” button posts feedback from the private “UTC clock feedback (to sort)” forum. 0: button hidden.',
		},
		selcal_feedback_target: {
			label: 'Forum for accepted SELCAL feedback',
			help: 'Number of the public forum where the “Accept” button posts feedback from the private “SELCAL feedback (to sort)” forum. 0: button hidden.',
		},
		reglages_feedback_target: {
			label: 'Forum for accepted Settings Workshop feedback',
			help: 'Number of the public forum where the “Accept” button posts feedback from the private “Settings Workshop feedback (to sort)” forum. 0: button hidden.',
		},
		avatars: {
			label: 'Use avatars',
			help: 'When enabled, users can upload an avatar that will be shown under their title/rank.',
		},
		avatars_dir: {
			label: 'Upload directory',
			help: 'The directory avatars are uploaded to (relative to the board root). PHP must have write permission on this directory.',
		},
		avatars_width: { label: 'Max width', help: 'The maximum allowed avatar width in pixels (60 recommended).' },
		avatars_height: { label: 'Max height', help: 'The maximum allowed avatar height in pixels (60 recommended).' },
		avatars_size: { label: 'Max size', help: 'The maximum allowed avatar size in bytes (10240 recommended).' },
		admin_email: { label: 'Admin email', help: 'The email address of the board administrator (optional).' },
		webmaster_email: {
			label: 'Webmaster email',
			help: 'Contact address of the board (optional). The sender of outgoing emails is set by the server configuration (MAIL_FROM, a domain verified with the email service).',
		},
		forum_subscriptions: {
			label: 'Forum subscriptions',
			help: 'Allow users to subscribe to forums (they receive an email when someone starts a new topic).',
		},
		topic_subscriptions: {
			label: 'Topic subscriptions',
			help: 'Allow users to subscribe to topics (they receive an email when someone replies).',
		},
		regs_allow: {
			label: 'New accounts',
			help: 'When enabled, someone signing in with GitHub or Google for the first time gets an account. When disabled, only existing members can sign in: a newcomer sees a message saying registrations are closed.',
		},
		regs_report: {
			label: 'Report new accounts',
			help: 'When enabled, an email goes to the mailing list (see above) whenever an account is created.',
		},
		rules: {
			label: 'Terms and rules in the menu',
			help: 'Adds a “Rules” link to the top menu, pointing to the Terms and rules page (also in the footer, editable in Information pages).',
		},
		default_email_setting: {
			label: 'Default email setting',
			help: 'Choose the default privacy setting for new user registrations.',
		},
		announcement: { label: 'Display announcement', help: 'Enable this to show the message below on every page of the forums.' },
		announcement_message: {
			label: 'Announcement message',
			help: 'This text is not parsed like regular posts and may contain HTML.',
		},
	} as Record<string, { label: string; help: string | null }>,
	feedTypes: ['None', 'RSS'],
	reportMethods: ['Internal', 'Email', 'Both'],
	emailSettings: [
		'Display email address to other users.',
		'Hide email address but allow the email form.',
		'Hide email address and do not allow the email form.',
	],
	mailResend: 'Email delivery: Resend (API key set in the Worker secrets).',
	mailLog: 'Email delivery: no service configured, emails are only written to the log (RESEND_API_KEY and MAIL_FROM secrets).',
	yes: 'Yes',
	no: 'No',
	save: 'Save changes',
	updated: 'Options updated.',
	errors: {
		missingTitle: 'You must enter a board title.',
		invalidAdminEmail: 'The admin email address you entered is invalid.',
		invalidWebmasterEmail: 'The webmaster email address you entered is invalid.',
		timeout: 'The value of “Online timeout” must be smaller than the value of “Visit timeout”.',
		invalidBaseUrl: 'The base URL is not a valid address.',
	},
	defaults: {
		announcement: 'Enter your announcement here.',
		maintenance: 'The forums are temporarily down for maintenance. Please try again in a few minutes.',
	},
};
