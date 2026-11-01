/**
 * English translation of src/lang/fr/staticPages.ts: AvroBB information pages (footer): terms and
 * rules, privacy policy, help. These are the default texts; the administration (admin_pages.php)
 * can replace them (services/staticPageConfig.ts).
 */

import type { staticPages as frStaticPages, StaticPage } from '../fr/staticPages.ts';

export const staticPages: typeof frStaticPages = {
	updated: 'Last updated: October 2026.',
	updatedOn: (date: string) => `Last updated: ${date}.`,
	contactTitle: 'Contact us',
	contactText: 'For any question about this page, write to the administrator:',

	terms: {
		title: 'Terms and rules',
		intro:
			'AvroBB is Emmanuel Pierrez’s personal forum: a place to talk about his projects (software, websites, experiments). By logging in or posting, you accept the rules below. They have a single goal: keeping the forum useful, welcoming and pleasant to read.',
		sections: [
			{
				title: 'Respect and courtesy',
				paragraphs: [
					'Stay courteous, even when you disagree. Personal attacks, insults, harassment, and discriminatory or hateful remarks are not tolerated.',
					'Beginner questions are welcome: greet them kindly.',
				],
			},
			{
				title: 'Posting well',
				paragraphs: [
					'Choose the forum that matches your topic and give it a clear title. Indicate the project concerned with the topic tags: that way the discussions of each project are easy to find.',
					'To report a problem, describe what you did, what you expected and what happened. When the topic is settled, add the “Résolu” tag.',
					'Avoid posts in capital letters, posts without content and unsolicited advertising.',
				],
			},
			{
				title: 'Copyright',
				paragraphs: [
					'Only post what you have the right to share: your texts, your screenshots, your creations, or content whose source you cite.',
					'Code you share in a post is deemed published under the license of your choice, to be specified if it matters to you.',
				],
			},
			{
				title: 'Your content',
				paragraphs: [
					'You remain the author of your posts and images. By posting them, you allow AvroBB to display them on the forum, including in quotes and search results.',
					'You can edit your posts for a limited time after sending them. After that, ask a moderator.',
				],
			},
			{
				title: 'Machine translation',
				paragraphs: [
					'AvroBB is written for both French and English speakers: posts, topic titles and forum descriptions are machine translated into English or French. By posting, you allow AvroBB to show your post in the other language.',
					'Translation is done by the Mistral Small 3.1 artificial intelligence model, from the French company Mistral AI, hosted by Cloudflare. It may be imperfect: it is marked as such, and the original text is always available. Private messages are never translated.',
				],
			},
			{
				title: 'Moderation and sanctions',
				paragraphs: [
					'Moderators can move, close, edit or delete a post or topic that does not follow these rules. Use a post’s “Report” link rather than replying to it.',
					'Depending on its seriousness, a breach may lead to a reminder or a ban, temporary or permanent. A banned member can still read the forum, but can no longer post.',
				],
			},
			{
				title: 'Liability',
				paragraphs: [
					'Each member is responsible for what they post. Opinions and advice shared on the forum are given in good faith, without warranty.',
					'These rules may change; the version in force is always the one on this page.',
				],
			},
		],
	},

	privacy: {
		title: 'Privacy policy',
		intro:
			'This page explains what data AvroBB keeps about you, why, and how to exercise your rights, in accordance with the General Data Protection Regulation (GDPR).',
		sections: [
			{
				title: 'Data collected',
				paragraphs: [
					'At your first login with GitHub or Google: your account identifier with that provider (to recognize you at later logins), your username or display name (to suggest your name on the forum) and, if it has one, your verified email address. AvroBB neither receives nor stores any password, does not keep the provider’s access token beyond login and does not copy your profile picture.',
					'What you choose to publish: posts, gallery images, avatar, signature and optional profile information (location, website…).',
					'For the forum’s security: the IP address used for each post, as well as the dates of your first login, last visit and last post.',
				],
			},
			{
				title: 'Why this data',
				paragraphs: [
					'It is used only to run the forum: identifying you, displaying your contributions, notifying you of new private messages or replies to followed topics, and fighting spam and abuse.',
					'Your data is not sold, rented or used for advertising.',
				],
			},
			{
				title: 'Who has access',
				paragraphs: [
					'Your posts, profile and avatar are public. Your email address stays hidden, unless you choose to show it in your profile.',
					'IP addresses are visible only to administrators and moderators, to spot abuse. Private messages are read only by their recipients.',
					'The forum is hosted by Cloudflare (servers, database and files), which acts as a technical processor.',
					'For machine translation, the text of public posts and titles is sent to Cloudflare’s artificial intelligence service (Workers AI, Mistral Small 3.1 model by Mistral AI), without your name or any other personal data. Cloudflare does not use it to train its models. Private messages are never sent to it.',
				],
			},
			{
				title: 'Cookies',
				paragraphs: [
					'The forum only sets cookies needed for it to work: your login session (30 days, extended at each visit), a ten-minute cookie while logging in with GitHub or Google, a security token against fraudulent form submissions, and tracking of topics already read. They are not used for any advertising tracking and therefore do not require consent.',
				],
			},
			{
				title: 'Retention period',
				paragraphs: [
					'Your account and contributions are kept as long as your account exists. Public posts remain visible to preserve the thread of discussions, even old ones.',
					'You can delete your account yourself from your profile (Essentials section, “Delete my account”): your personal data, subscriptions, drafts, private messages, gallery images and avatar are erased immediately. Your public posts remain, under the name “Deleted member” and without IP address, to keep discussions consistent.',
				],
			},
			{
				title: 'Your rights',
				paragraphs: [
					'You can view and correct your information at any time from your profile, and log out of all your devices (“Sign me out everywhere”). You also have the right to access, rectify, erase, restrict and object to the processing of your data.',
					'To exercise these rights, write to the address below. If you run into difficulties, you can contact the CNIL, the French data protection authority (cnil.fr).',
				],
			},
		],
		contact: {
			text: 'For any question about your data or to exercise your rights, write to the data protection officer:',
			email: 'dpo@pierrez.net',
		},
	},

	faq: {
		title: 'Help',
		intro: 'Answers to the most common questions about the forum. Another question? Ask it in the appropriate forum.',
		sections: [
			{
				title: 'Logging in',
				paragraphs: [
					'Reading is open to everyone. To post, log in with your GitHub account: your AvroBB account is created at your first login, with no registration form or password.',
				],
				links: [{ label: 'Log in', href: 'login.php' }],
			},
			{
				title: 'Writing and formatting',
				paragraphs: [
					'The toolbar above the message field formats your text (bold, links, lists, quotes, code, videos…) with BBCode tags. The “Preview” button shows the result before sending.',
					'To quote a specific passage, select it in the post and click “Quote”. You can also save a post as a draft and resume it later.',
				],
				links: [{ label: 'BBCode help', href: 'help.php' }],
			},
			{
				title: 'Images',
				paragraphs: [
					'The toolbar’s image button offers three choices: the address of an online image, an image from your gallery, or a new image uploaded directly. Images are optimized to display quickly, including on mobile.',
					'A gallery image inserted in a post is displayed as a card, with its title and caption.',
				],
				links: [{ label: 'Gallery', href: 'gallery.php' }],
			},
			{
				title: 'Mentioning a member',
				paragraphs: [
					'Type @ followed by the beginning of a username, then pick the member from the list. They will be notified by private message that they were mentioned.',
				],
			},
			{
				title: 'Subject tags',
				paragraphs: [
					'The colored badges in front of a topic title indicate the project concerned or the topic’s status (“Question”, “Bug”, “Résolu”…). The topic author can change them at any time with the “Subject tags” button.',
				],
			},
			{
				title: 'Private messages',
				paragraphs: [
					'Private messages let you write to one or more members. When you receive one, a badge with their count appears on “PM” in the menu.',
				],
			},
			{
				title: 'Following activity',
				paragraphs: [
					'“New” lists the topics that have received posts since your last visit. You can also follow a topic or a forum to be notified by email of new replies.',
					'Topics with no new post for a long time are grouped in each forum’s “Old topics”: they remain available and search still finds them.',
				],
				links: [{ label: 'Search', href: 'search.php' }],
			},
			{
				title: 'Reputation',
				paragraphs: [
					'The + and − buttons next to a member’s name let you thank them for valuable help or point out unconstructive behavior. Use them sparingly.',
				],
			},
		],
	},
} satisfies Record<'terms' | 'privacy' | 'faq', StaticPage> & Record<string, unknown>;
