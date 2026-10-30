/**
 * Modèle de vue de l'index (index.php) : catégories et forums, puis l'activité de la semaine
 * (AvroBB, à la place du bloc « Informations sur les forums ») : membres en ligne avec leur avatar,
 * discussions les plus commentées avec leur dernière image, nouveaux membres, projets les plus
 * discutés. Les totaux sont sur la page Statistiques. Fonction pure : données chargées par IndexController.
 */

import type { BoardConfig, IndexCategory, OnlineVisitor, RecentTopic, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { HotTopic, NewMember } from '../repositories/HomeActivityRepository.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { lastImageUrl, projectShares } from '../services/homeActivity.ts';
import { mobileVariantUrl } from '../services/imageVariants.ts';
import { niceNumber } from '../services/numberFormat.ts';
import { readableOn, type SubjectSegment, subjectSegments } from '../services/subjectTags.ts';
import { forumHasNewPosts, type TrackedTopics } from '../services/trackedTopics.ts';
import { type ProjectLinkView, projectLinkViews } from './projectLinks.ts';
import { topicUrl } from './topicPage.ts';

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
	links: ProjectLinkView[];
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
	/** Membres en ligne (avatar ou initiale) et nombre d'invités ; null si o_users_online est désactivé. */
	online: { users: OnlineMemberView[]; guests: string | null } | null;
	/** Discussions les plus commentées de la semaine, avec leur dernière image. */
	hotTopics: HotTopicView[];
	newMembers: PersonLink[];
	/** Projets les plus discutés de la semaine (balises des discussions actives). */
	projects: { name: string; count: number; percent: number; background: string; foreground: string; label: string }[];
}

export interface OnlineMemberView extends PersonLink {
	avatarUrl: string | null;
	initial: string;
}

export interface HotTopicView {
	href: string;
	subject: SubjectSegment[];
	subjectText: string;
	imageUrl: string | null;
	activity: string;
}

export interface IndexPageInput {
	viewer: Viewer;
	config: BoardConfig;
	categories: readonly IndexCategory[];
	/** Sujets lisibles mis à jour depuis la dernière visite (vide pour un invité). */
	recentTopics: readonly RecentTopic[];
	tracked: TrackedTopics;
	/** null si o_users_online est désactivé. */
	online: readonly OnlineVisitor[] | null;
	/** Avatar des membres en ligne, par identifiant (absent ou null : initiale). */
	avatars: ReadonlyMap<number, string | null>;
	hotTopics: readonly HotTopic[];
	/** Dernier message avec image de chaque discussion de `hotTopics` (BBCode brut). */
	hotTopicImages: ReadonlyMap<number, string>;
	newMembers: readonly NewMember[];
	activeSubjects: readonly string[];
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
				links: projectLinkViews(forum.links, lang),
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
	const t = lang.index;
	const { config } = input;

	return {
		categories,
		// Rien à marquer comme lu : pas de lien (AvroBB).
		markReadUrl:
			!viewer.isGuest && categories.some((category) => category.forums.some((forum) => forum.newPostsUrl !== null))
				? 'misc.php?action=markread'
				: null,
		online:
			input.online !== null
				? {
						users: onlineUsers.map((visitor) => ({
							...person(visitor.userId, visitor.ident),
							avatarUrl: input.avatars.get(visitor.userId) ?? null,
							initial: [...visitor.ident][0]?.toUpperCase() ?? '?',
						})),
						guests: numGuests > 0 ? t.guestsOnlineCount(numGuests) : null,
					}
				: null,
		hotTopics: input.hotTopics.map((topic) => {
			const image = lastImageUrl(input.hotTopicImages.get(topic.id) ?? '');
			return {
				href: topicUrl(topic.id),
				subject: subjectSegments(topic.subject, config.subjectTags),
				subjectText: topic.subject,
				// Variante mobile (640 px) des images du forum : plus légère pour une vignette.
				imageUrl: image !== null ? (mobileVariantUrl(image, config.baseUrl) ?? image) : null,
				activity: t.weekPosts(topic.recentPosts),
			};
		}),
		newMembers: input.newMembers.map((member) => person(member.id, member.username)),
		projects: projectShares(input.activeSubjects, config.subjectTags).map((share) => ({
			name: share.tag.name,
			count: share.count,
			percent: share.percent,
			...readableOn(share.tag.color),
			label: t.projectShare(share.tag.name, share.count),
		})),
	};
}
