/**
 * English translation of src/lang/fr/indexPage.ts: index page texts.
 */

import type { indexPage as frIndexPage } from '../fr/indexPage.ts';

export const indexPage: typeof frIndexPage = {
	topics: 'Topics',
	posts: 'Posts',
	lastPost: 'Last post',
	linkTo: 'Link to:',
	emptyBoard: 'The forums are empty for now.',
	newestUser: 'Newest member:',
	usersOnline: 'Members online:',
	guestsOnline: 'Guests online:',
	totalUsers: 'Total members:',
	totalTopics: 'Total topics:',
	totalPosts: 'Total posts:',
	online: 'Currently online:',
	boardStats: 'Board statistics',
	userInfo: 'User information',
	newPosts: 'New posts',
	moderatedBy: 'Moderated by',
	by: 'by',
	never: 'Never',
	markAllAsRead: 'Mark all topics as read',

	// This week's activity (AvroBB), instead of “Board information”
	nowOnline: 'Right now',
	nobodyOnline: 'Nobody here yet… go ahead and start a conversation!',
	guestsOnlineCount: (n: number) => (n === 1 ? '+ 1 guest' : `+ ${n} guests`),
	hotTopics: 'Talked about this week',
	weekPosts: (n: number) => (n === 1 ? '1 post this week' : `${n} posts this week`),
	noHotTopics: 'No topics yet this week.',
	newMembers: 'Welcome to',
	newMembersInfo: 'Joined this week: a quick hello is always appreciated.',
	projects: 'Projects this week',
	projectShare: (name: string, count: number) => (count === 1 ? `${name}: 1 topic` : `${name}: ${count} topics`),
};
