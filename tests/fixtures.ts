/**
 * Doublures en mémoire des repositories et objets de test.
 */

import type { AppDeps } from '../src/app.ts';
import {
	type BoardConfig,
	type Draft,
	type EditableProfile,
	type ForumCategory,
	type ForumInfo,
	type ForumTarget,
	type GalleryImage,
	type Group,
	GroupId,
	type IndexCategory,
	type MemberFilter,
	type MemberSort,
	type MemberSummary,
	type ModeratedTopic,
	type OnlineVisitor,
	type Post,
	type PostingTarget,
	type ProfileChanges,
	type RecentTopic,
	type Report,
	type ReputationTarget,
	type ReputationVote,
	type Subscriber,
	type Topic,
	type TopicAgeFilter,
	type TopicSummary,
	type UserProfile,
	type Viewer,
} from '../src/domain/models.ts';
import { fr, frDateWords } from '../src/lang/fr/index.ts';
import type { Recipient, SenderLimits } from '../src/repositories/ContactRepository.ts';
import type { DraftStore, NewDraft } from '../src/repositories/DraftRepository.ts';
import type { AdminCategory, AdminForum, ForumAdminStore } from '../src/repositories/ForumAdminRepository.ts';
import type { HotTopic, NewMember } from '../src/repositories/HomeActivityRepository.ts';
import type { ModerationStore } from '../src/repositories/ModerationRepository.ts';
import type { OnlineWriter } from '../src/repositories/OnlineRepository.ts';
import type { PostEditStore, PostUpdate } from '../src/repositories/PostEditRepository.ts';
import type { NewReply, NewTopic, PostingStore } from '../src/repositories/PostingRepository.ts';
import type { ProfileStore } from '../src/repositories/ProfileRepository.ts';
import type { ReportTarget } from '../src/repositories/ReportRepository.ts';
import type { NewVote } from '../src/repositories/ReputationRepository.ts';
import type { PostLocation } from '../src/repositories/TopicRepository.ts';
import type { AdminUserRow, IpPoster, IpStat } from '../src/repositories/UserAdminRepository.ts';
import type { ViewerRecord } from '../src/repositories/UserRepository.ts';
import type { AdminGroup } from '../src/services/adminGroups.ts';
import type { Ban } from '../src/services/bans.ts';
import type { CensoredWord } from '../src/services/censor.ts';
import type { GroupForumPermissionRow } from '../src/services/forumPermissions.ts';
import type { MailMessage } from '../src/services/mail.ts';
import { buildSessionCookie } from '../src/services/session.ts';
import { DEFAULT_SUBJECT_TAGS } from '../src/services/subjectTagConfig.ts';
import type { UserSearchCriteria } from '../src/services/userSearch.ts';
import { fakePrivateMessageStore, type PmData, pmData } from './fakePrivateMessages.ts';

export const NOW = 1_782_900_000;

/** Secret des signatures dans les tests (cookie de session, jeton CSRF). */
export const COOKIE_SECRET = 'graine-de-test';

/** En-tête Cookie d'une session ouverte pour ce membre (échéance par défaut : une heure). */
export function sessionCookie(userId: number, expires: number = NOW + 3600): string {
	return `avrobb_session=${buildSessionCookie(userId, expires, COOKIE_SECRET)}`;
}

export function group(overrides: Partial<Group> = {}): Group {
	return {
		id: GroupId.Member,
		title: 'Membres',
		userTitle: '',
		isModerator: false,
		canModPromoteUsers: false,
		canModEditUsers: false,
		canModRenameUsers: false,
		canModChangePasswords: false,
		canModBanUsers: false,
		canSetTitle: false,
		canReadBoard: true,
		canViewUsers: true,
		canPostReplies: true,
		canEditPosts: true,
		canDeletePosts: true,
		canDeleteTopics: true,
		canSendEmail: true,
		canPostTopics: true,
		canPostLinks: true,
		postFlood: 30,
		promoteNextGroup: 0,
		promoteMinPosts: 0,
		canSearch: true,
		canSearchUsers: true,
		searchFlood: 30,
		canUsePrivateMessages: true,
		privateMessageLimit: 0,
		canUseReputation: true,
		reputationPlusMinPosts: 0,
		reputationMinusMinPosts: 0,
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
		logged: NOW - 600,
		style: 'Air',
		usesPrivateMessages: true,
		privateMessageCount: 0,
		showSmilies: true,
		showImages: true,
		showSignatureImages: true,
		reputationEnabled: true,
		email: 'tessy@example.com',
		numPosts: 12,
		lastPost: null,
		autoNotify: false,
		lastSearch: null,
		ban: null,
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
		posterId: 3,
		numReplies: 0,
		forum: { id: 1, name: 'Forum', moderators: new Map() },
		forumReplyPermission: null,
		isSubscribed: false,
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
	boardDescription: 'Le forum de <b>test</b>',
	defaultPostsPerPage: 25,
	defaultTopicsPerPage: 30,
	showDot: false,
	forumSubscriptions: true,
	topicSubscriptions: true,
	topicViews: true,
	rulesMessage: '<p>Soyez <em>courtois</em>.</p>',
	searchAllForums: true,
	dateFormat: 'Y-m-d',
	timeFormat: 'H:i:s',
	showUserInfo: true,
	showPostCount: true,
	signatures: true,
	avatars: false,
	avatarsDir: 'img/avatars',
	avatarMaxWidth: 60,
	avatarMaxHeight: 60,
	avatarMaxBytes: 10240,
	bbcode: true,
	imgTag: true,
	defaultStyle: 'Air',
	rules: false,
	registrationsAllowed: true,
	additionalNavlinks: '',
	reportsByEmail: false,
	reportsByBoard: true,
	maintenance: false,
	maintenanceMessage: 'Le forum est fermé pour <b>maintenance</b>.',
	coldTopicDays: 0,
	headerVersion: 0,
	staticPages: {},
	timeoutVisit: 1800,
	timeoutOnline: 300,
	adminEmail: 'admin@forum.test',
	webmasterEmail: 'webmaster@forum.test',
	smtp: { host: '', user: '', pass: '', ssl: false },
	defaultUserGroup: 4,
	registration: {
		verify: false,
		report: false,
		mailingList: 'liste@forum.test',
		allowBannedEmail: false,
		allowDupeEmail: false,
		defaultEmailSetting: 1,
		defaultTimezone: 0,
		defaultDst: false,
		defaultLang: 'French',
	},
	posting: {
		topicReview: 15,
		quoteDepth: 3,
		makeLinks: true,
		subjectAllCaps: false,
		messageAllCaps: false,
		forceGuestEmail: true,
		quickpost: true,
	},
	announcement: null,
	quickjump: true,
	feedType: 'rss',
	privateMessagesEnabled: false,
	smilies: true,
	signatureSmilies: true,
	censoring: false,
	signatureBbcode: true,
	signatureImgTag: false,
	signatureMaxLength: 400,
	signatureMaxLines: 4,
	signatureAllCaps: false,
	subjectTags: [...DEFAULT_SUBJECT_TAGS],
	privateMessageNotification: false,
	privateMessageMaxReceivers: 3,
	privateMessagesPerPage: 15,
	baseUrl: 'http://forum.test',
	indentSpaces: 4,
	reputationEnabled: false,
	reputationTimeout: 0,
	usersOnline: true,
};

export const forumCategories: ForumCategory[] = [
	{ id: 1, name: 'Simulateurs', forums: [{ id: 1, name: 'Forum', isRedirect: false }] },
	{ id: 2, name: 'Ateliers', forums: [{ id: 2, name: 'Captures & Vidéos', isRedirect: false }] },
];

export interface FakeData {
	/** Membres connus ; `presence` vaut null par défaut (pas encore dans la liste des présents). */
	users: (Omit<ViewerRecord, 'presence'> & { presence?: ViewerRecord['presence'] })[];
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
	indexCategories?: IndexCategory[];
	forumInfos?: ForumInfo[];
	/** Sujets par forum, déjà dans l'ordre d'affichage. */
	forumTopics?: Map<number, TopicSummary[]>;
	members?: MemberSummary[];
	sentMails?: MailMessage[];
	/** Sujets dont le compteur de vues a été incrémenté. */
	viewedTopics?: number[];
	profiles?: UserProfile[];
	galleryImages?: GalleryImage[];
	/** Fichiers de la galerie enregistrés ou effacés. */
	galleryFileLog?: string[];
	/** Activité de la semaine de l'accueil (HomeActivityReader). */
	hotTopics?: HotTopic[];
	hotTopicImages?: Map<number, string>;
	newMembers?: NewMember[];
	activeSubjects?: string[];
	/** Logo et bannière : journal des écritures, images précédentes disponibles. */
	headerImageLog?: string[];
	headerImagePrevious?: Set<string>;
	recentTopics?: RecentTopic[];
	online?: OnlineVisitor[];
	bans?: Ban[];
	/** Sujets suivis par le visiteur (topic_subscriptions). */
	subscribedTopics?: number[];
	subscribedForums?: number[];
	/** Abonnés à prévenir d'une réponse ou d'une discussion. */
	subscribers?: Subscriber[];
	/** Réponses et discussions enregistrées par post.php. */
	savedReplies?: NewReply[];
	savedTopics?: NewTopic[];
	/** Écritures de edit.php et delete.php. */
	postUpdates?: PostUpdate[];
	deletedPosts?: number[];
	deletedTopics?: number[];
	/** Brouillons (table brouillons), modifiés en place. */
	drafts?: Draft[];
	createdDrafts?: NewDraft[];
	/** Destinataires du formulaire d'e-mail, par identifiant. */
	recipients?: Map<number, Recipient>;
	senderLimits?: SenderLimits;
	/** Envois enregistrés par misc.php (e-mail, signalement). */
	contactLog?: string[];
	createdReports?: { target: ReportTarget; reportedBy: number; created: number; message: string }[];
	/** search_cache en mémoire : identifiant → { propriétaire, données sérialisées }. */
	searchCache?: Map<number, { ident: string; data: string }>;
	searchLog?: string[];
	/** Champs de modification des profils, en plus de `profiles` (valeurs par défaut sinon). */
	profileDetails?: Map<number, Partial<EditableProfile>>;
	/** Écritures de profile.php. */
	profileUpdates?: { id: number; changes: ProfileChanges }[];
	renames?: { id: number; from: string; to: string }[];
	/** Avatars enregistrés ou effacés. */
	avatarLog?: string[];
	/** Renommée : membres (totaux), votes reçus par membre, cibles par message, votes ajoutés. */
	reputationMembers?: { id: number; username: string; plus: number; minus: number }[];
	reputationVotes?: Map<number, ReputationVote[]>;
	reputationTargets?: ReputationTarget[];
	addedVotes?: NewVote[];
	deletedVotes?: { userId: number; ids: number[] }[];
	/** Modération : sujets modérables, forums de destination, actions consignées. */
	moderatedTopics?: ModeratedTopic[];
	targetForums?: ForumTarget[];
	moderationLog?: string[];
	/** Table config brute (admin_options.php), écritures et invalidations du cache. */
	configValues?: Map<string, string>;
	configUpdates?: ReadonlyMap<string, string | null>[];
	configInvalidations?: number;
	configLog?: string[];
	/** Administration des catégories et forums (admin_categories.php, admin_forums.php). */
	forumAdmin?: { categories: AdminCategory[]; forums: AdminForum[]; permissions: GroupForumPermissionRow[] };
	forumAdminLog?: string[];
	/** Groupes d'utilisateurs (admin_groups.php). */
	adminGroups?: AdminGroup[];
	groupMembers?: Map<number, number>;
	groupAdminLog?: string[];
	/** admin_users.php : IP par membre, auteurs par IP, résultats et critères de recherche reçus. */
	ipStats?: Map<number, IpStat[]>;
	ipPosters?: Map<string, IpPoster[]>;
	adminUserRows?: AdminUserRow[];
	userSearches?: UserSearchCriteria[];
	userActionLog?: string[];
	/** Écritures d'admin_bans.php. */
	banLog?: string[];
	/** admin_maintenance.php : actions consignées, discussions élagables. */
	maintenanceLog?: string[];
	/** Préfixes du sujet : sujets réécrits. */
	subjectUpdates?: { topicId: number; subject: string }[];
	/** Signalements listés par admin_reports.php (modifiés en place quand ils sont traités). */
	reportList?: Report[];
	/** Messagerie privée en mémoire (créée vide au besoin). */
	pm?: PmData;
}

/** Profil modifiable tiré d'un UserProfile de test, avec des préférences par défaut. */
export function editableProfile(profile: UserProfile, details: Partial<EditableProfile> = {}): EditableProfile {
	return {
		...profile,
		topicsPerPage: null,
		postsPerPage: null,
		timezone: 1,
		dst: false,
		style: 'Air',
		notifyWithPost: false,
		autoNotify: false,
		usesPrivateMessages: true,
		notifyPrivateMessages: false,
		notifyPrivateMessagesFull: false,
		showSmilies: true,
		showImages: true,
		showSignatureImages: true,
		showAvatars: true,
		showSignatures: true,
		reputationEnabled: true,
		registrationIp: '192.0.2.7',
		adminNote: '',
		lastVisit: NOW - 3600,
		...details,
	};
}

/** Modification des profils en mémoire : chaque écriture est consignée dans `data`. */
function fakeProfileStore(data: FakeData): ProfileStore {
	const details = (id: number): Partial<EditableProfile> => data.profileDetails?.get(id) ?? {};
	const merge = (id: number, changes: Partial<EditableProfile>): void => {
		data.profileDetails = new Map([...(data.profileDetails ?? []), [id, { ...details(id), ...changes }]]);
	};
	return {
		findEditableProfile: async (id) => {
			const found = data.profiles?.find((p) => p.id === id);
			return found === undefined ? null : editableProfile(found, details(id));
		},
		updateProfile: async (id, changes) => {
			data.profileUpdates = [...(data.profileUpdates ?? []), { id, changes }];
			merge(id, changes);
		},
		renameUser: async (id, from, to, changes) => {
			data.renames = [...(data.renames ?? []), { id, from, to }];
			data.profileUpdates = [...(data.profileUpdates ?? []), { id, changes }];
			merge(id, { ...changes, username: to });
			return { bansUpdated: (data.bans ?? []).some((ban) => ban.username === from) };
		},
		findSimilarUsername: async (username, _skeleton, excludeId) =>
			data.profiles?.find((p) => p.id !== excludeId && p.username.toLowerCase() === username.toLowerCase())?.username ?? null,
		listUsernamesByEmail: async (email, excludeId) =>
			(data.profiles ?? []).filter((p) => p.id !== excludeId && p.email === email).map((p) => p.username),
	};
}

/** Liste des présents en mémoire : chaque écriture est consignée dans `log` pour les tests. */
export interface FakeOnline extends OnlineWriter {
	log: string[];
}

export function fakeOnline(visitors: readonly OnlineVisitor[] = []): FakeOnline {
	const log: string[] = [];
	return {
		log,
		findGuestPresence: async (ip) =>
			visitors.some((v) => v.userId === 1 && v.ident === ip) ? { logged: NOW - 60, idle: false, lastPost: null, lastSearch: null } : null,
		enter: async (userId, ident) => void log.push(`enter ${userId} ${ident}`),
		refreshMember: async (userId) => void log.push(`refresh ${userId}`),
		refreshGuest: async (ip) => void log.push(`refresh guest ${ip}`),
		setLastVisit: async (userId, at) => void log.push(`last_visit ${userId} ${at}`),
		listStale: async () => [],
		applyPurge: async () => undefined,
		removeMember: async (userId) => void log.push(`remove ${userId}`),
		removeIdent: async (ident) => void log.push(`remove ident ${ident}`),
	};
}

const sortKey = (sort: MemberSort): 'username' | 'registered' | 'numPosts' => (sort === 'num_posts' ? 'numPosts' : sort);

function matchMember(member: MemberSummary, filter: MemberFilter): boolean {
	const pattern = filter.username === null ? null : new RegExp(`^${filter.username.replaceAll('*', '.*')}$`, 'i');
	return (pattern === null || pattern.test(member.username)) && (filter.groupId === null || member.groupId === filter.groupId);
}

/** Brouillons en mémoire. */
function fakeDrafts(data: FakeData): DraftStore {
	return {
		create: async (draft) => {
			data.createdDrafts = [...(data.createdDrafts ?? []), draft];
			return 700 + data.createdDrafts.length;
		},
		listByPoster: async (posterId) => (data.drafts ?? []).filter((d) => d.posterId === posterId),
		find: async (id) => (data.drafts ?? []).find((d) => d.id === id) ?? null,
		update: async (id, changes) => {
			data.drafts = (data.drafts ?? []).map((d) =>
				d.id === id ? { ...d, message: changes.message, subject: changes.subject ?? d.subject } : d,
			);
		},
		delete: async (id, posterId) => {
			data.drafts = (data.drafts ?? []).filter((d) => !(d.id === id && d.posterId === posterId));
		},
	};
}

/** Modification et suppression en mémoire, à partir des sujets et messages de `data`. */
function fakePostEdits(data: FakeData): PostEditStore {
	return {
		findPost: async (postId, groupId) => {
			for (const [topicId, posts] of data.posts) {
				const found = posts.find((p) => p.id === postId);
				const topic = data.topics.find((t) => t.id === topicId);
				if (found === undefined || topic === undefined) continue;
				const readers = data.forumReaders?.get(topic.forum.id);
				if (readers !== undefined && !readers.includes(groupId)) return null;
				return {
					id: found.id,
					poster: found.username,
					posterId: found.author?.id ?? 1,
					posterIsAdmin: found.author?.groupId === GroupId.Admin,
					message: found.message,
					hideSmilies: found.hideSmilies,
					posted: found.posted,
					topic: { id: topic.id, subject: topic.subject, sticky: topic.sticky, closed: topic.closed, firstPostId: topic.firstPostId },
					forum: topic.forum,
				};
			}
			return null;
		},
		updatePost: async (update) => {
			data.postUpdates = [...(data.postUpdates ?? []), update];
		},
		deletePost: async (post) => {
			data.deletedPosts = [...(data.deletedPosts ?? []), post.id];
			const posts = data.posts.get(post.topic.id) ?? [];
			return posts.filter((p) => p.id < post.id).at(-1)?.id ?? null;
		},
		deleteTopic: async (post) => {
			data.deletedTopics = [...(data.deletedTopics ?? []), post.topic.id];
		},
	};
}

/** Rédaction en mémoire : cibles tirées de `topics` et `forumInfos`, écritures consignées dans `data`. */
function fakePosting(data: FakeData): PostingStore {
	const readable = (forumId: number, groupId: number): boolean => {
		const readers = data.forumReaders?.get(forumId);
		return readers === undefined || readers.includes(groupId);
	};
	return {
		findTarget: async (target, viewer): Promise<PostingTarget | null> => {
			if ('forumId' in target) {
				const forum = data.forumInfos?.find((f) => f.id === target.forumId);
				if (forum === undefined || !readable(forum.id, viewer.groupId)) return null;
				return {
					forum: { id: forum.id, name: forum.name, moderators: forum.moderators, isRedirect: forum.redirectUrl !== null },
					replyPermission: null,
					topicPermission: forum.topicPermission,
					topic: null,
				};
			}
			const topic = data.topics.find((t) => t.id === target.topicId);
			if (topic === undefined || !readable(topic.forum.id, viewer.groupId)) return null;
			return {
				forum: { ...topic.forum, isRedirect: false },
				replyPermission: topic.forumReplyPermission,
				topicPermission: null,
				topic: {
					id: topic.id,
					subject: topic.subject,
					closed: topic.closed,
					isSubscribed: (data.subscribedTopics ?? []).includes(topic.id),
				},
			};
		},
		findQuote: async (postId, topicId) => {
			const found = (data.posts.get(topicId) ?? []).find((p) => p.id === postId);
			return found === undefined ? null : { poster: found.username, message: found.message };
		},
		listReview: async (topicId, limit) =>
			(data.posts.get(topicId) ?? [])
				.toReversed()
				.slice(0, limit)
				.map((p) => ({ poster: p.username, message: p.message, hideSmilies: p.hideSmilies, posted: p.posted })),
		createReply: async (reply) => {
			data.savedReplies = [...(data.savedReplies ?? []), reply];
			return 900 + data.savedReplies.length;
		},
		createTopic: async (topic) => {
			data.savedTopics = [...(data.savedTopics ?? []), topic];
			return { topicId: 800 + data.savedTopics.length, postId: 900 + data.savedTopics.length };
		},
		listTopicSubscribers: async () => data.subscribers ?? [],
		listForumSubscribers: async () => data.subscribers ?? [],
	};
}

/** Modération en mémoire : chaque action est consignée dans `data.moderationLog`. */
function fakeModeration(data: FakeData): ModerationStore {
	const log = (entry: string): void => {
		data.moderationLog = [...(data.moderationLog ?? []), entry];
	};
	const topicsOf = (forumId: number) => data.forumTopics?.get(forumId) ?? [];
	const inForum = (forumId: number, ids: readonly number[]) =>
		ids.length > 0 && ids.every((id) => topicsOf(forumId).some((t) => t.id === id));
	return {
		findTopic: async (topicId, forumId) => data.moderatedTopics?.find((t) => t.id === topicId && t.forum.id === forumId) ?? null,
		listTargetForums: async () => data.targetForums ?? [],
		findPostIp: async (postId) => [...data.posts.values()].flat().find((p) => p.id === postId)?.posterIp ?? null,
		deletePosts: async (topic, postIds, allowAdmin) => {
			if (postIds.includes(topic.firstPostId)) return false;
			const posts = data.posts.get(topic.id) ?? [];
			if (!allowAdmin && posts.some((p) => postIds.includes(p.id) && p.author?.groupId === GroupId.Admin)) return false;
			log(`deletePosts ${topic.id} ${postIds.join(',')}`);
			return true;
		},
		splitPosts: async (topic, postIds, target, subject) => {
			if (postIds.includes(topic.firstPostId) || !(data.targetForums ?? []).some((f) => f.forumId === target)) return null;
			log(`split ${topic.id} ${postIds.join(',')} -> ${target} ${subject}`);
			return 999;
		},
		moveTopics: async (forumId, ids, target, withRedirect) => {
			if (!inForum(forumId, ids) || target === forumId || !(data.targetForums ?? []).some((f) => f.forumId === target)) return false;
			log(`move ${ids.join(',')} -> ${target}${withRedirect ? ' +redirect' : ''}`);
			return true;
		},
		mergeTopics: async (forumId, ids, withRedirect) => {
			if (ids.length < 2 || !inForum(forumId, ids)) return null;
			log(`merge ${ids.join(',')}${withRedirect ? ' +redirect' : ''}`);
			return Math.min(...ids);
		},
		deleteTopics: async (forumId, ids) => {
			if (!inForum(forumId, ids)) return 'invalid';
			log(`deleteTopics ${ids.join(',')}`);
			return 'deleted';
		},
		setClosed: async (_forumId, ids, closed) => log(`${closed ? 'close' : 'open'} ${ids.join(',')}`),
		setSticky: async (forumId, id, sticky) => {
			log(`${sticky ? 'stick' : 'unstick'} ${id}`);
			return inForum(forumId, [id]);
		},
	};
}

/** Administration des catégories et forums en mémoire ; les écritures sont consignées dans `forumAdminLog`. */
function fakeForumAdmin(data: FakeData): ForumAdminStore {
	const log = (entry: string): void => {
		data.forumAdminLog = [...(data.forumAdminLog ?? []), entry];
	};
	const admin = (): NonNullable<FakeData['forumAdmin']> => {
		data.forumAdmin ??= { categories: [], forums: [], permissions: [] };
		return data.forumAdmin;
	};
	return {
		listCategories: async () => admin().categories,
		addCategory: async (name) => log(`addCategory ${name}`),
		updateCategories: async (categories) => log(`updateCategories ${categories.map((c) => `${c.id}:${c.name}:${c.position}`).join(',')}`),
		deleteCategory: async (id) => log(`deleteCategory ${id}`),
		listForums: async () =>
			admin().forums.map((forum) => ({
				categoryId: forum.categoryId,
				categoryName: admin().categories.find((cat) => cat.id === forum.categoryId)?.name ?? '',
				forumId: forum.id,
				forumName: forum.name,
				position: 0,
			})),
		addForum: async (categoryId, name) => log(`addForum ${categoryId} ${name}`),
		updateForumPositions: async (positions) => log(`positions ${positions.map((p) => `${p.id}:${p.position}`).join(',')}`),
		findForum: async (id) => admin().forums.find((forum) => forum.id === id) ?? null,
		updateForum: async (id, details) => log(`updateForum ${id} ${JSON.stringify(details)}`),
		listGroupPermissions: async () => admin().permissions,
		setGroupPermission: async (forumId, groupId, permission) => log(`perm ${forumId} ${groupId} ${JSON.stringify(permission)}`),
		revertPermissions: async (forumId) => log(`revert ${forumId}`),
		deleteForum: async (id) => log(`deleteForum ${id}`),
	};
}

/** Filtre récent/ancien des doublures, comme TopicRepository. */
function matchesAge(topic: TopicSummary, age: TopicAgeFilter | null): boolean {
	if (age === null) return true;
	const last = topic.lastPost?.postedAt ?? 0;
	return age.old ? !topic.sticky && last < age.before : topic.sticky || last >= age.before;
}

export function fakeDeps(data: FakeData, overrides: Partial<AppDeps> = {}): AppDeps {
	data.pm ??= pmData();
	const allPosts = (): { topicId: number; post: Post; position: number }[] =>
		[...data.posts].flatMap(([topicId, posts]) => posts.map((post, i) => ({ topicId, post, position: i + 1 })));

	return {
		config: { load: async () => ({ ...boardConfig, ...data.config }) },
		configStore: {
			loadValues: async () => new Map(data.configValues ?? []),
			updateValues: async (changes) => {
				data.configUpdates = [...(data.configUpdates ?? []), changes];
				for (const [name, value] of changes) data.configValues?.set(name, value ?? '');
			},
			replaceValues: async (values) => {
				data.configValues ??= new Map();
				for (const [name, value] of values) data.configValues.set(name, value);
				data.configLog = [...(data.configLog ?? []), `replace ${[...values.keys()].join(',')}`];
			},
			deleteValues: async (names) => {
				for (const name of names) data.configValues?.delete(name);
				data.configLog = [...(data.configLog ?? []), `delete ${names.join(',')}`];
			},
		},
		forumAdmin: fakeForumAdmin(data),
		memberSuggest: {
			suggestMembers: async (prefix, limit) =>
				data.users
					.filter((u) => u.viewer.id > 1 && u.viewer.username.toLowerCase().startsWith(prefix.toLowerCase()))
					.slice(0, limit)
					.map((u) => ({ id: u.viewer.id, username: u.viewer.username })),
		},
		subjectPrefixes: {
			firstPostMessage: async (postId) => [...data.posts.values()].flat().find((p) => p.id === postId)?.message ?? '',
			updateSubject: async (topicId, _firstPostId, subject) => {
				data.subjectUpdates = [...(data.subjectUpdates ?? []), { topicId, subject }];
			},
			findSubjectsContaining: async (text) =>
				data.topics.filter((t) => t.subject.includes(text)).map((t) => ({ id: t.id, subject: t.subject })),
			updateSubjects: async (updates) => {
				for (const { id, subject } of updates) data.subjectUpdates = [...(data.subjectUpdates ?? []), { topicId: id, subject }];
			},
		},
		imageProcessor: {
			// Image de test : « webp<côté>:<contenu> », dimensions fictives.
			toWebp: async (input, maxSide) =>
				input.subarray(0, 4).toString('latin1') === '\x89PNG' || input.subarray(0, 3).toString('latin1') === 'GIF'
					? { data: Buffer.from(`webp${maxSide}:${input.length}`), width: maxSide, height: maxSide }
					: null,
			// Avatar réduit : en-tête PNG aux dimensions permises (lu par readImageInfo()).
			avatar: async (_input, _type, limits) => {
				const header = Buffer.alloc(33);
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
				header.writeUInt32BE(13, 8);
				header.write('IHDR', 12, 'latin1');
				header.writeUInt32BE(limits.width, 16);
				header.writeUInt32BE(limits.height, 20);
				return { data: header, type: 'png' };
			},
			// Logo, bannière : « png|jpeg<largeur>x<hauteur>:<taille> » pour une image PNG ou GIF de test.
			fit: async (input, options) =>
				input.subarray(0, 4).toString('latin1') === '\x89PNG' || input.subarray(0, 3).toString('latin1') === 'GIF'
					? { data: Buffer.from(`${options.format}${options.maxWidth}x${options.maxHeight}:${input.length}`), width: 1, height: 1 }
					: null,
		},
		maintenance: {
			firstPostId: async () => 100,
			emptySearchIndex: async () => {
				data.maintenanceLog = [...(data.maintenanceLog ?? []), 'empty'];
			},
			postsToIndex: async (startAt, limit) =>
				[...data.posts.values()]
					.flat()
					.filter((p) => p.id >= startAt)
					.sort((a, b) => a.id - b.id)
					.slice(0, limit)
					.map((p) => ({ id: p.id, message: p.message, subject: null })),
			indexPost: async (postId) => {
				data.maintenanceLog = [...(data.maintenanceLog ?? []), `index ${postId}`];
			},
			nextPostId: async (postId) =>
				[...data.posts.values()]
					.flat()
					.map((p) => p.id)
					.filter((id) => id > postId)
					.sort((a, b) => a - b)[0] ?? null,
		},
		banStore: {
			findBan: async (id) => {
				const ban = (data.bans ?? []).find((b) => b.id === id);
				return ban !== undefined
					? {
							id: ban.id,
							username: ban.username || null,
							ip: ban.ip || null,
							email: ban.email || null,
							message: ban.message || null,
							expire: ban.expire,
						}
					: null;
			},
			addBan: async (ban, creatorId) => {
				data.banLog = [...(data.banLog ?? []), `add ${JSON.stringify(ban)} by ${creatorId}`];
			},
			updateBan: async (id, ban) => {
				data.banLog = [...(data.banLog ?? []), `update ${id} ${JSON.stringify(ban)}`];
			},
			removeBan: async (id) => {
				data.banLog = [...(data.banLog ?? []), `remove ${id}`];
			},
			findTarget: async (by) => {
				const user = data.users.find((u) => ('id' in by ? u.viewer.id === by.id : u.viewer.username === by.username) && u.viewer.id > 1);
				return user !== undefined
					? {
							id: user.viewer.id,
							username: user.viewer.username,
							email: `${user.viewer.username.toLowerCase()}@example.test`,
							groupId: user.viewer.group.id,
							isModerator: user.viewer.group.isModerator,
						}
					: null;
			},
			lastKnownIp: async () => '192.0.2.5',
			countBans: async () => (data.bans ?? []).length,
			searchBans: async () =>
				(data.bans ?? []).map((ban) => ({
					id: ban.id,
					username: ban.username || null,
					ip: ban.ip || null,
					email: ban.email || null,
					message: ban.message || null,
					expire: ban.expire,
					creator: { id: 2, username: 'admin' },
				})),
		},
		userAdmin: {
			countIpStats: async (userId) => (data.ipStats?.get(userId) ?? []).length,
			listIpStats: async (userId, offset, limit) => (data.ipStats?.get(userId) ?? []).slice(offset, offset + limit),
			countIpPosters: async (ip) => (data.ipPosters?.get(ip) ?? []).length,
			listIpPosters: async (ip, offset, limit) => (data.ipPosters?.get(ip) ?? []).slice(offset, offset + limit),
			countUsers: async () => (data.adminUserRows ?? []).length,
			searchUsers: async (criteria, offset, limit) => {
				data.userSearches = [...(data.userSearches ?? []), criteria];
				return (data.adminUserRows ?? []).slice(offset, offset + limit);
			},
			countPrivileged: async (ids) => {
				const groups = ids.map((id) => data.users.find((u) => u.viewer.id === id)?.viewer.group);
				return {
					admins: groups.filter((g) => g?.id === GroupId.Admin).length,
					moderators: groups.filter((g) => g?.isModerator === true).length,
				};
			},
			listMoveTargets: async () => [
				{ id: 2, title: 'Modérateurs', isModerator: true },
				{ id: 4, title: 'Membres', isModerator: false },
			],
			moveUsers: async (ids, groupId) => {
				data.userActionLog = [...(data.userActionLog ?? []), `move ${ids.join(',')} -> ${groupId}`];
			},
			deleteUsers: async (ids, withPosts) => {
				data.userActionLog = [...(data.userActionLog ?? []), `delete ${ids.join(',')}${withPosts ? ' +posts' : ''}`];
			},
			banUsers: async (ids, ban) => {
				data.userActionLog = [...(data.userActionLog ?? []), `ban ${ids.join(',')} ${JSON.stringify(ban)}`];
			},
		},
		groupAdmin: {
			listGroups: async () => data.adminGroups ?? [],
			titleExists: async (title, exceptId) => (data.adminGroups ?? []).some((g) => g.title === title && g.id !== exceptId),
			addGroup: async (settings, baseGroupId) => {
				data.groupAdminLog = [...(data.groupAdminLog ?? []), `add ${settings.title} from ${baseGroupId}`];
				return 9;
			},
			updateGroup: async (id, settings) => {
				data.groupAdminLog = [...(data.groupAdminLog ?? []), `update ${id} ${JSON.stringify(settings)}`];
			},
			countMembers: async (id) => data.groupMembers?.get(id) ?? 0,
			deleteGroup: async (id, moveTo) => {
				data.groupAdminLog = [...(data.groupAdminLog ?? []), `delete ${id} -> ${moveTo}`];
			},
			listPrivateMessageRights: async () =>
				(data.adminGroups ?? [])
					.filter((g) => g.id !== GroupId.Admin && g.id !== GroupId.Guest)
					.map((g) => ({ id: g.id, title: g.title, allowed: true, limit: 20 })),
			setPrivateMessageRights: async (id, allowed, limit) => {
				data.groupAdminLog = [...(data.groupAdminLog ?? []), `pm ${id} ${allowed} ${limit}`];
			},
		},
		configCache: {
			invalidate: async () => {
				data.configInvalidations = (data.configInvalidations ?? 0) + 1;
			},
		},
		users: {
			findViewer: async (id) => {
				const found = data.users.find((u) => u.viewer.id === id);
				return found === undefined ? null : { presence: null, ...found };
			},
		},
		accounts: {
			findIdByUsername: async (username) =>
				data.users.find((u) => !u.viewer.isGuest && u.viewer.username.toLowerCase() === username.toLowerCase())?.viewer.id ?? null,
			findSimilarUsername: async (username, skeleton) =>
				data.users.find(
					(u) => [username.toUpperCase(), skeleton.toUpperCase()].includes(u.viewer.username.toUpperCase()) && !u.viewer.isGuest,
				)?.viewer.username ?? null,
		},
		devLogin: true,
		mailTemplates: {
			load: async (name) => ({
				subject: `Sujet ${name}`,
				body: 'Bonjour <username>, mot de passe <new_password>, lien <activation_url> -- <board_mailer>',
			}),
		},
		mailer: {
			send: async (message) => {
				data.sentMails = [...(data.sentMails ?? []), message];
			},
		},
		profiles: { findProfile: async (id) => data.profiles?.find((p) => p.id === id) ?? null },
		profileStore: fakeProfileStore(data),
		privateMessageStore: fakePrivateMessageStore(data.pm),
		moderation: fakeModeration(data),
		reportStore: {
			listReports: async (zapped) => (data.reportList ?? []).filter((r) => (r.zapped !== null) === zapped),
			zap: async (id, userId, now) => {
				data.reportList = (data.reportList ?? []).map((r) =>
					r.id === id && r.zapped === null ? { ...r, zapped: { at: now, by: { id: userId, username: 'modo' } } } : r,
				);
			},
		},
		adminStats: {
			countActiveOnline: async () => 4,
			databaseInfo: async () => ({ version: '11.4.2-MariaDB', rows: 12345, bytes: 3 * 1024 * 1024 }),
		},
		serverInfo: { loadAverage: () => [0.5, 0.25, 0.125], operatingSystem: () => 'linux 7.0', runtimeVersion: () => 'v24.0.0' },
		hostResolver: { reverse: async (ip) => (ip === '192.0.2.5' ? 'pilote.example.test' : ip) },
		reputation: {
			findMember: async (id) => data.reputationMembers?.find((m) => m.id === id) ?? null,
			countVotes: async (id) => data.reputationVotes?.get(id)?.length ?? 0,
			listVotes: async (id, offset, limit) => (data.reputationVotes?.get(id) ?? []).slice(offset, offset + limit),
			findTarget: async (postId) => data.reputationTargets?.find((t) => t.postId === postId) ?? null,
			lastVoteTime: async (from, to) =>
				(data.addedVotes ?? [])
					.filter((v) => v.fromUserId === from && v.userId === to)
					.reduce<number | null>((last, v) => Math.max(last ?? 0, v.time), null),
			addVote: async (vote) => {
				data.addedVotes = [...(data.addedVotes ?? []), vote];
			},
			deleteVotes: async (userId, ids) => {
				data.deletedVotes = [...(data.deletedVotes ?? []), { userId, ids: [...ids] }];
			},
		},
		avatarStore: {
			save: async (userId, _dir, type) => {
				data.avatarLog = [...(data.avatarLog ?? []), `save ${userId}.${type}`];
			},
			delete: async (userId) => {
				data.avatarLog = [...(data.avatarLog ?? []), `delete ${userId}`];
			},
		},
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
			findReadable: async (id, groupId, userId) => {
				const found = data.topics.find((t) => t.id === id) ?? null;
				const readers = found !== null ? data.forumReaders?.get(found.forum.id) : undefined;
				if (found === null || (readers !== undefined && !readers.includes(groupId))) return null;
				return { ...found, isSubscribed: userId !== undefined && userId > 1 && (data.subscribedTopics ?? []).includes(id) };
			},
			locatePost: async (postId): Promise<PostLocation | null> => {
				const hit = allPosts().find((p) => p.post.id === postId);
				return hit === undefined ? null : { topicId: hit.topicId, position: hit.position };
			},
			findLastPostId: async (topicId) => data.posts.get(topicId)?.at(-1)?.id ?? null,
			listUpdatedSince: async (_groupId, since) => (data.recentTopics ?? []).filter((t) => t.lastPost > since),
			listForumPage: async (forumId, _sort, offset, limit, _dot, age = null) =>
				(data.forumTopics?.get(forumId) ?? []).filter((t) => matchesAge(t, age)).slice(offset, offset + limit),
			countForumTopics: async (forumId, age) => (data.forumTopics?.get(forumId) ?? []).filter((t) => matchesAge(t, age)).length,
			findFirstPostAfter: async (topicId, since) => (data.posts.get(topicId) ?? []).find((p) => p.posted > since)?.id ?? null,
		},
		topicWriter: {
			incrementViews: async (topicId) => {
				data.viewedTopics = [...(data.viewedTopics ?? []), topicId];
			},
		},
		posts: { listPage: async (topicId, offset, limit) => (data.posts.get(topicId) ?? []).slice(offset, offset + limit) },
		posting: fakePosting(data),
		postEdits: fakePostEdits(data),
		drafts: fakeDrafts(data),
		contacts: {
			findRecipient: async (id) => data.recipients?.get(id) ?? null,
			findSenderLimits: async () => data.senderLimits ?? { lastEmailSent: null, emailFlood: 60, lastReportSent: null, reportFlood: 60 },
			markEmailSent: async (userId, at) => {
				data.contactLog = [...(data.contactLog ?? []), `email ${userId} ${at}`];
			},
			markReportSent: async (userId, at) => {
				data.contactLog = [...(data.contactLog ?? []), `report ${userId} ${at}`];
			},
		},
		reportWriter: {
			findTarget: async (postId) => {
				for (const [topicId, posts] of data.posts) {
					const topic = data.topics.find((t) => t.id === topicId);
					if (topic !== undefined && posts.some((p) => p.id === postId))
						return { postId, topicId, subject: topic.subject, forumId: topic.forum.id, forumName: topic.forum.name };
				}
				return null;
			},
			create: async (report) => {
				data.createdReports = [...(data.createdReports ?? []), report];
			},
		},
		subscriptions: {
			isReadable: async (target) =>
				target.kind === 'topic' ? data.topics.some((t) => t.id === target.id) : (data.forumInfos ?? []).some((f) => f.id === target.id),
			isSubscribed: async (target) =>
				target.kind === 'topic' ? (data.subscribedTopics ?? []).includes(target.id) : (data.subscribedForums ?? []).includes(target.id),
			subscribe: async (target) => {
				if (target.kind === 'topic') data.subscribedTopics = [...(data.subscribedTopics ?? []), target.id];
				else data.subscribedForums = [...(data.subscribedForums ?? []), target.id];
			},
			unsubscribe: async (target) => {
				if (target.kind === 'topic') data.subscribedTopics = (data.subscribedTopics ?? []).filter((id) => id !== target.id);
				else data.subscribedForums = (data.subscribedForums ?? []).filter((id) => id !== target.id);
			},
		},
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
			findCachedSearch: async (id, ident) => {
				const cached = data.searchCache?.get(id);
				return cached !== undefined && cached.ident === ident ? cached.data : null;
			},
		},
		searchWriter: {
			recordSearch: async (searcher, at) => {
				data.searchLog = [
					...(data.searchLog ?? []),
					`${'userId' in searcher ? `membre ${searcher.userId}` : `invité ${searcher.ip}`} ${at}`,
				];
			},
			saveCachedSearch: async (id, ident, serialized) => {
				data.searchCache = new Map([...(data.searchCache ?? []), [id, { ident, data: serialized }]]);
			},
		},
		stopwords: { load: async () => new Set(['les', 'pour']) },
		gallery: {
			countImages: async (owner, search = '') =>
				(data.galleryImages ?? [])
					.filter((i) => (owner ?? null) === null || i.userId === owner)
					.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(search.toLowerCase())).length,
			listImages: async (offset, limit, owner, search = '') =>
				(data.galleryImages ?? [])
					.filter((i) => (owner ?? null) === null || i.userId === owner)
					.filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(search.toLowerCase()))
					.slice(offset, offset + limit),
			findImage: async (id) => data.galleryImages?.find((i) => i.id === id) ?? null,
			createImage: async (image) => {
				const id = 300 + (data.galleryImages?.length ?? 0);
				data.galleryImages = [{ id, ...image, username: 'membre' }, ...(data.galleryImages ?? [])];
				return id;
			},
			deleteImage: async (id) => {
				data.galleryImages = (data.galleryImages ?? []).filter((i) => i.id !== id);
			},
		},
		sitemap: {
			listForums: async () => (data.forumInfos ?? []).map((forum) => ({ id: forum.id, lastPost: 1_782_800_000 })),
			listTopics: async (limit) => data.topics.slice(0, limit).map((topic) => ({ id: topic.id, lastPost: 1_782_800_000 })),
		},
		homeActivity: {
			listHotTopics: async (_groupId, _since, limit) => (data.hotTopics ?? []).slice(0, limit),
			findLatestImageMessages: async (ids) => new Map([...(data.hotTopicImages ?? [])].filter(([id]) => ids.includes(id))),
			listNewMembers: async (_since, limit) => (data.newMembers ?? []).slice(0, limit),
			listActiveSubjects: async () => data.activeSubjects ?? [],
		},
		headerImages: {
			replace: async (kind, image) => {
				data.headerImageLog = [...(data.headerImageLog ?? []), `replace ${kind} ${image.toString()}`];
				data.headerImagePrevious = new Set([...(data.headerImagePrevious ?? []), kind]);
			},
			restore: async (kind) => {
				if (!data.headerImagePrevious?.has(kind)) return false;
				data.headerImageLog = [...(data.headerImageLog ?? []), `restore ${kind}`];
				return true;
			},
			hasPrevious: async (kind) => data.headerImagePrevious?.has(kind) ?? false,
		},
		galleryFiles: {
			save: async (addedAt, extension, files) => {
				const sizes = `${files.image.toString()} ${files.thumbnail.toString()} ${files.mobile.toString()}`;
				data.galleryFileLog = [...(data.galleryFileLog ?? []), `save ${addedAt}${extension} ${sizes}`];
				return addedAt;
			},
			delete: async (addedAt, extension) => {
				data.galleryFileLog = [...(data.galleryFileLog ?? []), `delete ${addedAt}${extension}`];
			},
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
		bans: {
			listBannedUsernames: async () => new Set(data.bannedUsernames ?? []),
			listBans: async () => data.bans ?? [],
			deleteBans: async (ids) => {
				data.bans = (data.bans ?? []).filter((ban) => !ids.includes(ban.id));
			},
		},
		online: fakeOnline(data.online ?? []),
		censorship: {
			listWords: async () => data.censoredWords ?? [],
			listEntries: async () => (data.censoredWords ?? []).map((word, index) => ({ id: index + 1, ...word })),
			addWord: async (word) => {
				data.censoredWords = [...(data.censoredWords ?? []), word];
			},
			updateWord: async (id, word) => {
				data.censoredWords = (data.censoredWords ?? []).map((current, index) => (index + 1 === id ? word : current));
			},
			removeWord: async (id) => {
				data.censoredWords = (data.censoredWords ?? []).filter((_, index) => index + 1 !== id);
			},
		},
		page: { lang: fr, dateWords: frDateWords, clock: () => NOW },
		cookie: { name: 'avrobb', secret: COOKIE_SECRET, secure: false },
		...overrides,
	};
}
