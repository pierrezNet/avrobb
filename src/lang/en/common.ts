/**
 * English translation of src/lang/fr/common.ts: texts shared by every page (header, footer,
 * error notices, member titles).
 */

import type { common as frCommon } from '../fr/common.ts';

export const common: typeof frCommon = {
	langCode: 'en',
	/** Link to the same page in the other language (footer). */
	otherLanguage: 'Français',
	/** Language of share previews (og:locale). */
	ogLocale: 'en_US',

	// Links of a project forum (AvroBB)
	projectLinks: 'Project links',
	projectSite: 'Project website',
	projectRepository: 'Repository',

	// Notices
	badRequest: 'Error. The link you followed is incorrect or outdated.',
	tooManyRequests: 'Too many requests in a short time. Please wait a minute before trying again.',
	noView: 'You do not have permission to view these forums.',
	badCsrf: 'Bad CSRF token. You were sent to this page from an unauthorized source.',
	noPermission: 'You do not have permission to access this page.',
	/** Not in FluxBB: replaces the technical error page of error(). */
	serverError: 'An error occurred. Please try again in a few moments.',

	// Bans (check_bans())
	banMessage: 'You are banned from this forum.',
	banExpires: (date: string) => `Your ban expires on ${date}.`,
	banReason: 'The administrator or moderator who banned you left the following message:',
	banContact: 'For any question, contact the administrator',
	// Footer: information pages (AvroBB)
	footerNav: 'Information',
	footerTerms: 'Terms and rules',
	footerPrivacy: 'Privacy policy',
	footerHelp: 'Help',
	footerStats: 'Statistics',
	/** Menu badge (PM): count followed by this text for screen readers. */
	unreadCount: 'unread',
	banReadOnly: 'You are banned: you can still read the forum, but no longer post.',
	banWriteRefused: 'You are banned: you can still read the forum, but no longer post. This action is not allowed.',

	// Miscellaneous
	announcement: 'Announcement',
	info: 'Info',
	goBack: 'Go back',
	/** Not in FluxBB: message() goes back with JavaScript, here a real link. */
	backToIndex: 'Back to the home page',
	maintenance: 'Maintenance',
	previous: 'Previous',
	next: 'Next',
	spacer: '…',
	pages: 'Pages',
	page: (n: number) => `Page ${n}`,

	// BBCode (include/parser.php)
	wrote: (author: string) => `${author} wrote:`,
	imageLink: 'image',
	/** Not in FluxBB: labels of the spoiler (Spoiler mod) and of the embedded video player. */
	spoiler: 'Spoiler',
	video: 'Video',

	// Titles
	member: 'Member',
	moderator: 'Moderator',
	administrator: 'Administrator',
	banned: 'On vacation',
	guest: 'Guest',

	// Navigation (top of every page)
	skipToContent: 'Skip to content',
	menu: 'Menu',
	mainNav: 'Main navigation',
	breadcrumbs: 'Breadcrumbs',
	index: 'Home',
	userList: 'Member list',
	/** Additions to the PV menu. */
	gallery: 'Gallery',
	drafts: 'Drafts',
	rules: 'Rules',
	search: 'Search',
	register: 'Register',
	login: 'Log in',
	notLoggedIn: 'You are not logged in.',
	profile: 'Profile',
	logout: 'Log out',
	loggedInAs: 'Logged in as ',
	admin: 'Administration',
	lastVisit: (date: string) => `Last visit: ${date}`,
	topicSearches: 'Topics:',
	newPostsHeader: 'New',
	activeTopics: 'Recent',
	unansweredTopics: 'Unanswered',
	postedTopics: 'Mine',
	showNewPosts: 'Find topics with new posts since your last visit.',
	showActiveTopics: 'Find topics with recent posts.',
	showUnansweredTopics: 'Find topics with no replies.',
	showPostedTopics: 'Find topics you have posted in.',
	titleSeparator: ' / ',

	// Footer
	boardFooter: 'Board footer',
	/** “Mod controls” from lang/French/topic.php and forum.php. */
	modControls: 'Moderation',
	moderateTopic: 'Moderate topic',
	moveTopic: 'Move topic',
	openTopic: 'Open topic',
	closeTopic: 'Close topic',
	unstickTopic: 'Unstick topic',
	stickTopic: 'Stick topic',
	moderateForum: 'Moderate forum',
	/** PV tags in the viewtopic footer (footer.php). */
	poweredBy: 'Powered by',

	// Feeds (extern.php)
	rssForumFeed: 'Forum RSS feed',
	rssTopicFeed: 'Topic RSS feed',

	rssDescription: (board: string) => `The most recent topics at ${board}.`,
	rssDescriptionTopic: (topic: string) => `The most recent posts in ${topic}.`,
	rssReply: 'Re: ',

	// Administration links in the header
	newReports: 'New reports have been filed!',
	maintenanceModeEnabled: 'Maintenance mode is enabled!',

	/** Not in FluxBB: autocomplete list of member names (@mention, recipients). */
	memberSuggestions: 'Matching members',
};
