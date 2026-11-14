/**
 * English translation of src/lang/fr/topic.ts: viewtopic texts.
 */

import type { topic as frTopic } from '../fr/topic.ts';

export const topic: typeof frTopic = {
	quickPost: 'Reply',
	machineTranslated: 'Machine translated',
	showOriginal: 'Show original',
	isSubscribed: 'You are following this topic',
	unsubscribe: 'Unfollow',
	subscribe: 'Follow this topic',
	/** Feedback from a source app, in its private “to sort” forum (administrators). */
	acceptAppFeedback: {
		phraseo: 'Accept: publish in the phraseology forum',
		donneTonPoint: 'Accept: publish in the Donne Ton Point forum',
		horlogeUtc: 'Accept: publish in the UTC clock forum',
		selcal: 'Accept: publish in the SELCAL forum',
		reglages: 'Accept: publish in the Settings Workshop forum',
	},
	postReply: 'Post reply',
	topicClosed: 'Topic closed',
	from: 'From:',
	ipAddressLogged: 'Logged IP',
	note: 'Note:',
	posts: 'Posts:',
	registered: 'Registered:',
	website: 'Website',
	email: 'E-mail',
	online: 'Online',
	offline: 'Offline',
	lastEdit: 'Last edited by',
	report: 'Report',
	delete: 'Delete',
	edit: 'Edit',
	quote: 'Quote',
	re: 'Re:',
	/** lang/French/reputation.php */
	reputation: 'Reputation',
	reputationPlus: 'Increase reputation',
	reputationMinus: 'Decrease reputation',
	/** Likes and reactions below a post. */
	reactionsLabel: 'Reactions to this post',
	like: 'Like',
	reactions: { heart: 'Love', laugh: 'Funny', wow: 'Wow', sad: 'Sad', thanks: 'Thanks', party: 'Congrats' },
	react: 'React',
	you: 'You',
	/** “A, B, C and 5 others”: members who reacted, link to the list. */
	reactorsSummary: (names: readonly string[], others: number): string => {
		if (others > 0) return `${names.join(', ')} and ${others === 1 ? '1 other' : `${others} others`}`;
		return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
	},

	/** Subject prefixes (PV): Node-only page, opened from viewtopic. */
	subjectPrefixes: 'Subject tags',
	subjectPrefixesInfo:
		'Check the tags to show in front of the topic subject. You can change them at any time, even after the edit window for your post has passed.',
	projects: 'Project',
	otherPrefixes: 'Other',
	currentSubject: 'Current subject',
	newSubject: 'New subject',
	savePrefixes: 'Save',
	prefixesTooLong: 'The subject cannot exceed 70 characters with these tags.',
	cancel: 'Cancel',
};
