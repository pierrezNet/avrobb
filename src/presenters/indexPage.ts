/**
 * Modèle de vue de l'index (index.php) : catégories et forums, statistiques, membres en ligne.
 * Fonction pure : les données sont chargées par IndexController.
 */

import type { BoardConfig, IndexCategory, OnlineVisitor, RecentTopic, UsersInfo, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat, niceNumber } from '../services/numberFormat.ts';
import { forumHasNewPosts, type TrackedTopics } from '../services/trackedTopics.ts';

export interface PersonLink {
	label: string;
	/** Lien vers le profil ; null si le groupe ne peut pas voir les profils. */
	href: string | null;
}

export interface ForumRowView {
	id: number;
	name: string;
	href: string;
	/** Forum de redirection : lien externe, compteurs remplacés par « - ». */
	isRedirect: boolean;
	/** HTML de forums.forum_desc (saisi par l'administrateur). */
	descriptionHtml: string;
	moderators: PersonLink[];
	/** Lien « Nouveaux messages » ; null s'il n'y en a pas (ou pour un invité). */
	newPostsUrl: string | null;
	numTopics: string;
	numPosts: string;
	lastPost: { href: string; at: string; by: string } | null;
	/** Texte à la place du dernier message : « Jamais » ou « - - - » (redirection). */
	lastPostPlaceholder: string;
}

export interface IndexPageView {
	categories: { id: number; name: string; forums: ForumRowView[] }[];
	/** Lien « Marquer toutes les discussions comme lues » (membres seulement). */
	markReadUrl: string | null;
	stats: { totalUsers: string; totalTopics: string; totalPosts: string; newestUser: PersonLink | null };
	/** Membres et invités en ligne ; null si o_users_online est désactivé. */
	online: { users: PersonLink[]; numUsers: string; numGuests: string } | null;
}

export interface IndexPageInput {
	viewer: Viewer;
	config: BoardConfig;
	categories: readonly IndexCategory[];
	/** Sujets lisibles mis à jour depuis la dernière visite (vide pour un invité). */
	recentTopics: readonly RecentTopic[];
	tracked: TrackedTopics;
	usersInfo: UsersInfo;
	totals: { topics: number; posts: number };
	/** null si o_users_online est désactivé. */
	online: readonly OnlineVisitor[] | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

export function buildIndexPage(input: IndexPageInput): IndexPageView {
	const { viewer, lang } = input;
	const time = viewerTimeSettings(viewer);
	const person = (id: number, label: string): PersonLink => ({ label, href: viewer.group.canViewUsers ? `profile.php?id=${id}` : null });

	const categories = input.categories.map((category) => ({
		id: category.id,
		name: category.name,
		forums: category.forums.map((forum): ForumRowView => {
			const isRedirect = forum.redirectUrl !== null;
			const hasNew =
				!viewer.isGuest &&
				!isRedirect &&
				forumHasNewPosts(forum.id, forum.lastPost?.postedAt ?? null, viewer.lastVisit, input.recentTopics, input.tracked);

			return {
				id: forum.id,
				name: forum.name,
				href: forum.redirectUrl ?? `viewforum.php?id=${forum.id}`,
				isRedirect,
				descriptionHtml: forum.descriptionHtml,
				moderators: [...forum.moderators].map(([username, id]) => person(id, username)),
				newPostsUrl: hasNew ? `search.php?action=show_new&fid=${forum.id}` : null,
				numTopics: isRedirect ? '-' : niceNumber(forum.numTopics),
				numPosts: isRedirect ? '-' : niceNumber(forum.numPosts),
				lastPost:
					forum.lastPost !== null
						? {
								href: `viewtopic.php?pid=${forum.lastPost.postId}#p${forum.lastPost.postId}`,
								at: formatTime(forum.lastPost.postedAt, time, input.dateWords, input.now),
								by: forum.lastPost.poster,
							}
						: null,
				lastPostPlaceholder: isRedirect ? '- - -' : lang.index.never,
			};
		}),
	}));

	const onlineUsers = input.online?.filter((visitor) => visitor.userId > 1) ?? [];
	const numGuests = (input.online?.length ?? 0) - onlineUsers.length;
	const newest = input.usersInfo.newestUser;

	return {
		categories,
		markReadUrl: viewer.isGuest ? null : 'misc.php?action=markread',
		stats: {
			totalUsers: forumNumberFormat(input.usersInfo.totalUsers),
			totalTopics: forumNumberFormat(input.totals.topics),
			totalPosts: forumNumberFormat(input.totals.posts),
			newestUser: newest !== null ? person(newest.id, newest.username) : null,
		},
		online:
			input.online !== null
				? {
						users: onlineUsers.map((visitor) => person(visitor.userId, visitor.ident)),
						numUsers: forumNumberFormat(onlineUsers.length),
						numGuests: forumNumberFormat(numGuests),
					}
				: null,
	};
}
