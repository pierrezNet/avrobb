/**
 * English translation of src/lang/fr/forum.ts: viewforum texts.
 */

import type { forum as frForum } from '../fr/forum.ts';

export const forum: typeof frForum = {
	postTopic: 'New topic',
	replies: 'Replies',
	views: 'Views',
	lastPost: 'Last post',
	moved: 'Moved:',
	sticky: 'Sticky:',
	closed: 'Closed:',
	emptyForum: 'This forum has no topics.',
	metaDescription: (forum: string, board: string) => `Topics in the “${forum}” forum on ${board}.`,
	// Recent and old topics (AvroBB, set in Maintenance)
	oldTopics: (count: number) => `Old topics (${count})`,
	recentTopics: (count: number) => `Recent topics (${count})`,
	oldTopicsTitle: 'Old topics',
	oldTopicsInfo: (days: number) =>
		days === 1 ? 'Topics with no new post for more than 1 day.' : `Topics with no new post for more than ${days} days.`,
	noRecentTopics: 'No recent topics: see the old topics.',
	noOldTopics: 'No old topics in this forum.',
	isSubscribed: 'You are following this forum',
	unsubscribe: 'Unfollow',
	subscribe: 'Follow this forum',
	markForumRead: 'Mark this forum as read',
	newPosts: 'New posts',
	newPostsInfo: 'Go to the first new post in this topic.',
	by: 'by',
	/** Not in FluxBB: marks “you posted in this topic” (o_show_dot). */
	posted: 'You posted here',
	topicPages: 'Topic pages',
};
