/**
 * English translation of src/lang/fr/topic.ts: viewtopic texts.
 */

import type { topic as frTopic } from '../fr/topic.ts';

export const topic: typeof frTopic = {
	quickPost: 'Reply',
	isSubscribed: 'You are following this topic',
	unsubscribe: 'Unfollow',
	subscribe: 'Follow this topic',
	/** Feedback from a source app, in its private “to sort” forum (administrators). */
	acceptAppFeedback: {
		phraseo: 'Accept: publish in the phraseology forum',
		donneTonPoint: 'Accept: publish in the Donne Ton Point forum',
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
