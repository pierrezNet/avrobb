/**
 * Doublures en mémoire des repositories et objets de test.
 */

import type { AppDeps } from '../src/app.ts';
import {
	type BoardConfig,
	type ForumCategory,
	type ForumInfo,
	type GalleryImage,
	type Group,
	GroupId,
	type IndexCategory,
	type MemberFilter,
	type MemberSort,
	type MemberSummary,
	type OnlineVisitor,
	type Post,
	type RecentTopic,
	type Topic,
	type TopicLabel,
	type TopicSummary,
	type UserProfile,
	type Viewer,
} from '../src/domain/models.ts';
import { fr, frDateWords } from '../src/lang/fr/index.ts';
import type { PostLocation } from '../src/repositories/TopicRepository.ts';
import type { ViewerRecord } from '../src/repositories/UserRepository.ts';
import type { CensoredWord } from '../src/services/censor.ts';

export const NOW = 1_782_900_000;

export function group(overrides: Partial<Group> = {}): Group {
	return {
		id: GroupId.Member,
		title: 'Membres',
		userTitle: '',
		isModerator: false,
		canModPromoteUsers: false,
		canModEditUsers: false,
		canReadBoard: true,
		canViewUsers: true,
		canPostReplies: true,
		canEditPosts: true,
		canDeletePosts: true,
		canDeleteTopics: true,
		canSendEmail: true,
		canPostTopics: true,
		canSearch: true,
		canSearchUsers: true,
		canUsePrivateMessages: true,
		privateMessageLimit: 0,
		canUseReputation: true,
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
		topicsPerPage: null,
		timezone: 0,
		dst: false,
		showAvatars: true,
		showSignatures: true,
		lastVisit: NOW - 7200,
		style: 'Air',
		usesPrivateMessages: true,
		privateMessageCount: 0,
		showSmilies: true,
		showImages: true,
		showSignatureImages: true,
		reputationEnabled: true,
		...overrides,
	};
}

export const guest = viewer({
	id: 1,
	username: 'Invité',
	isGuest: true,
	group: group({
		id: GroupId.Guest,
		title: 'Invités',
		canPostReplies: false,
		canEditPosts: false,
		canDeletePosts: false,
		canDeleteTopics: false,
	}),
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
			acceptsPrivateMessages: true,
			reputationPlus: 0,
			reputationMinus: 0,
			reputationEnabled: true,
		},
		...overrides,
	};
}

export const boardConfig: BoardConfig = {
	boardTitle: 'Forum de test',
	defaultPostsPerPage: 25,
	defaultTopicsPerPage: 30,
	showDot: false,
	forumSubscriptions: true,
	topicSubscriptions: true,
	searchAllForums: true,
	dateFormat: 'Y-m-d',
	timeFormat: 'H:i:s',
	showUserInfo: true,
	showPostCount: true,
	signatures: true,
	avatars: false,
	avatarsDir: 'img/avatars',
	bbcode: true,
	imgTag: true,
	defaultStyle: 'Air',
	rules: false,
	registrationsAllowed: true,
	additionalNavlinks: '',
	reportsByBoard: true,
	maintenance: false,
	announcement: null,
	quickjump: true,
	feedType: 'atom',
	shownVersion: null,
	privateMessagesEnabled: false,
	smilies: true,
	signatureSmilies: true,
	censoring: false,
	signatureBbcode: true,
	signatureImgTag: false,
	baseUrl: 'http://forum.test',
	indentSpaces: 4,
	reputationEnabled: false,
	usersOnline: true,
};

export const forumCategories: ForumCategory[] = [
	{ id: 1, name: 'Simulateurs', forums: [{ id: 1, name: 'Forum', isRedirect: false }] },
	{ id: 2, name: 'Ateliers', forums: [{ id: 2, name: 'Captures & Vidéos', isRedirect: false }] },
];

export interface FakeData {
	users: ViewerRecord[];
	topics: Topic[];
	/** Messages par sujet, dans l'ordre. */
	posts: Map<number, Post[]>;
	/** Groupes autorisés à lire chaque forum (absent = tous). */
	forumReaders?: Map<number, number[]>;
	config?: Partial<BoardConfig>;
	pendingReports?: boolean;
	/** MP non lus par membre. */
	unreadPrivateMessages?: Map<number, number>;
	bannedUsernames?: string[];
	censoredWords?: CensoredWord[];
	/** Balises PV posées, par sujet. */
	topicLabels?: Map<number, TopicLabel[]>;
	indexCategories?: IndexCategory[];
	forumInfos?: ForumInfo[];
	/** Sujets par forum, déjà dans l'ordre d'affichage. */
	forumTopics?: Map<number, TopicSummary[]>;
	labelDefinitions?: TopicLabel[];
	members?: MemberSummary[];
	profiles?: UserProfile[];
	galleryImages?: GalleryImage[];
	recentTopics?: RecentTopic[];
	online?: OnlineVisitor[];
}

const sortKey = (sort: MemberSort): 'username' | 'registered' | 'numPosts' => (sort === 'num_posts' ? 'numPosts' : sort);

function matchMember(member: MemberSummary, filter: MemberFilter): boolean {
	const pattern = filter.username === null ? null : new RegExp(`^${filter.username.replaceAll('*', '.*')}$`, 'i');
	return (pattern === null || pattern.test(member.username)) && (filter.groupId === null || member.groupId === filter.groupId);
}

export function fakeDeps(data: FakeData, overrides: Partial<AppDeps> = {}): AppDeps {
	const allPosts = (): { topicId: number; post: Post; position: number }[] =>
		[...data.posts].flatMap(([topicId, posts]) => posts.map((post, i) => ({ topicId, post, position: i + 1 })));

	return {
		config: { load: async () => ({ ...boardConfig, ...data.config }) },
		users: { findViewer: async (id) => data.users.find((u) => u.viewer.id === id) ?? null },
		profiles: { findProfile: async (id) => data.profiles?.find((p) => p.id === id) ?? null },
		members: {
			countMembers: async (filter) => (data.members ?? []).filter((m) => matchMember(m, filter)).length,
			listMembers: async (filter, sort, direction, offset, limit) =>
				(data.members ?? [])
					.filter((m) => matchMember(m, filter))
					.sort((a, b) => (a[sortKey(sort)] < b[sortKey(sort)] ? -1 : 1) * (direction === 'asc' ? 1 : -1))
					.slice(offset, offset + limit),
			listGroups: async () => [
				{ id: GroupId.Admin, title: 'Administrateurs' },
				{ id: GroupId.Member, title: 'Membres' },
			],
		},
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
			listUpdatedSince: async (_groupId, since) => (data.recentTopics ?? []).filter((t) => t.lastPost > since),
			listForumPage: async (forumId, _sort, offset, limit) => (data.forumTopics?.get(forumId) ?? []).slice(offset, offset + limit),
		},
		posts: { listPage: async (topicId, offset, limit) => (data.posts.get(topicId) ?? []).slice(offset, offset + limit) },
		forums: {
			listReadable: async () => forumCategories,
			listIndex: async () => data.indexCategories ?? [],
			findReadable: async (forumId, groupId) => {
				const readers = data.forumReaders?.get(forumId);
				if (readers !== undefined && !readers.includes(groupId)) return null;
				return data.forumInfos?.find((f) => f.id === forumId) ?? null;
			},
		},
		search: {
			matchWord: async () => [],
			matchAuthor: async () => [],
			quickSearch: async () => [],
			listTopics: async () => [],
			listPosts: async () => [],
			findUsername: async () => null,
			findCachedSearch: async () => null,
		},
		stopwords: { load: async () => new Set(['les', 'pour']) },
		gallery: {
			countImages: async () => (data.galleryImages ?? []).length,
			listImages: async (offset, limit) => (data.galleryImages ?? []).slice(offset, offset + limit),
		},
		feeds: {
			findTopic: async () => null,
			listTopicPosts: async () => [],
			findForumName: async () => null,
			listRecentTopics: async () => [],
		},
		stats: { countTopicsAndPosts: async () => ({ topics: 1234, posts: 56789 }), listOnline: async () => data.online ?? [] },
		usersInfo: { load: async () => ({ totalUsers: 5, newestUser: { id: 6, username: 'valdefsx' } }) },
		reports: { hasPending: async () => data.pendingReports ?? false },
		privateMessages: { countUnread: async (userId) => data.unreadPrivateMessages?.get(userId) ?? 0 },
		avatars: { urlFor: async () => null },
		bans: { listBannedUsernames: async () => new Set(data.bannedUsernames ?? []) },
		censorship: { listWords: async () => data.censoredWords ?? [] },
		topicLabels: {
			listForTopics: async (ids) => new Map([...(data.topicLabels ?? [])].filter(([id]) => ids.includes(id))),
			listDefinitions: async () => data.labelDefinitions ?? [],
		},
		page: { lang: fr, dateWords: frDateWords, clock: () => NOW },
		legacyCookie: { name: 'punbb_cookie', seed: 'graine-de-test' },
		legacyBaseUrl: 'http://php.test',
		...overrides,
	};
}
