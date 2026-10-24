/**
 * Doublures en mémoire des repositories et objets de test.
 */

import type { AppDeps } from '../src/app.ts';
import { GroupId, type BoardConfig, type Group, type Post, type Topic, type Viewer } from '../src/domain/models.ts';
import { fr, frDateWords } from '../src/lang/fr.ts';
import type { ViewerRecord } from '../src/repositories/UserRepository.ts';
import type { PostLocation } from '../src/repositories/TopicRepository.ts';

export const NOW = 1_782_900_000;

export function group(overrides: Partial<Group> = {}): Group {
	return {
		id: GroupId.Member,
		title: 'Membres',
		userTitle: '',
		isModerator: false,
		canModPromoteUsers: false,
		canReadBoard: true,
		canViewUsers: true,
		canPostReplies: true,
		canEditPosts: true,
		canDeletePosts: true,
		canDeleteTopics: true,
		canSendEmail: true,
		...overrides,
	};
}

export function viewer(overrides: Partial<Viewer> = {}): Viewer {
	return {
		id: 3,
		username: 'Tessy',
		isGuest: false,
		group: group(),
		postsPerPage: null,
		timezone: 0,
		dst: false,
		showAvatars: true,
		showSignatures: true,
		...overrides,
	};
}

export const guest = viewer({
	id: 1,
	username: 'Invité',
	isGuest: true,
	group: group({ id: GroupId.Guest, title: 'Invités', canPostReplies: false, canEditPosts: false, canDeletePosts: false, canDeleteTopics: false }),
});

export function topic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: 10,
		subject: 'Sujet de test',
		closed: false,
		sticky: false,
		firstPostId: 100,
		numReplies: 0,
		forum: { id: 1, name: 'Forum', moderators: new Map() },
		forumReplyPermission: null,
		...overrides,
	};
}

export function post(id: number, overrides: Partial<Post> = {}): Post {
	return {
		id,
		username: 'Tessy',
		posterIp: '127.0.0.1',
		posterEmail: '',
		message: `Message ${id}`,
		hideSmilies: false,
		posted: NOW - 3600,
		edited: null,
		editedBy: '',
		author: {
			id: 3,
			email: 'tessy@example.test',
			title: '',
			url: '',
			location: '',
			signature: '',
			emailSetting: 1,
			numPosts: 2,
			registered: NOW - 86400 * 30,
			adminNote: '',
			groupId: GroupId.Member,
			groupUserTitle: '',
			isOnline: false,
		},
		...overrides,
	};
}

export const boardConfig: BoardConfig = {
	boardTitle: 'Forum de test',
	defaultPostsPerPage: 25,
	dateFormat: 'Y-m-d',
	timeFormat: 'H:i:s',
	showUserInfo: true,
	showPostCount: true,
	signatures: true,
	avatars: false,
	avatarsDir: 'img/avatars',
	bbcode: true,
	imgTag: true,
};

export interface FakeData {
	users: ViewerRecord[];
	topics: Topic[];
	/** Messages par sujet, dans l'ordre. */
	posts: Map<number, Post[]>;
	/** Groupes autorisés à lire chaque forum (absent = tous). */
	forumReaders?: Map<number, number[]>;
}

export function fakeDeps(data: FakeData, overrides: Partial<AppDeps> = {}): AppDeps {
	const allPosts = (): { topicId: number; post: Post; position: number }[] =>
		[...data.posts].flatMap(([topicId, posts]) => posts.map((post, i) => ({ topicId, post, position: i + 1 })));

	return {
		config: { load: async () => boardConfig },
		users: { findViewer: async (id) => data.users.find((u) => u.viewer.id === id) ?? null },
		topics: {
			findReadable: async (id, groupId) => {
				const found = data.topics.find((t) => t.id === id) ?? null;
				const readers = found !== null ? data.forumReaders?.get(found.forum.id) : undefined;
				return readers === undefined || readers.includes(groupId) ? found : null;
			},
			locatePost: async (postId): Promise<PostLocation | null> => {
				const hit = allPosts().find((p) => p.post.id === postId);
				return hit === undefined ? null : { topicId: hit.topicId, position: hit.position };
			},
			findLastPostId: async (topicId) => data.posts.get(topicId)?.at(-1)?.id ?? null,
		},
		posts: { listPage: async (topicId, offset, limit) => (data.posts.get(topicId) ?? []).slice(offset, offset + limit) },
		avatars: { urlFor: async () => null },
		page: { lang: fr, dateWords: frDateWords, clock: () => NOW },
		legacyCookie: { name: 'punbb_cookie', seed: 'graine-de-test' },
		styleDir: '.',
		legacyBaseUrl: 'http://php.test',
		...overrides,
	};
}
