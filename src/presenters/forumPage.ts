/**
 * Modèle de vue de viewforum.php : liste des sujets d'un forum. Fonction pure.
 */

import type { BoardConfig, ForumInfo, TopicSummary, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { pageCount } from '../services/pagination.ts';
import { canPostTopic } from '../services/permissions.ts';
import { type SubjectSegment, subjectSegments } from '../services/subjectTags.ts';
import type { TrackedTopics } from '../services/trackedTopics.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';
import { type ProjectLinkView, projectLinkViews } from './projectLinks.ts';
import { topicUrl } from './topicPage.ts';

/** Segment de sujet : texte simple ou pastille de balise colorée. */
export type SubjectPartView = SubjectSegment;

export interface TopicRowView {
	id: number;
	href: string;
	subject: SubjectPartView[];
	/** Sujet en texte brut (balises entre crochets), pour les libellés accessibles. */
	subjectText: string;
	poster: string;
	sticky: boolean;
	closed: boolean;
	moved: boolean;
	/** Messages non lus : sujet en gras et lien vers le premier nouveau message. */
	newPostsUrl: string | null;
	/** « Le point » : le membre a écrit dans ce sujet. */
	hasPosted: boolean;
	/** Mini-pagination du sujet (toutes les pages en liens) ; vide s'il tient sur une page. */
	pages: PaginationLink[];
	replies: string;
	views: string;
	lastPost: { href: string; at: string; by: string } | null;
}

export interface ForumPageView {
	forum: { id: number; name: string; links: ProjectLinkView[] };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	postTopicUrl: string | null;
	topics: TopicRowView[];
	/**
	 * Discussions récentes / anciennes (o_cold_topic_days) : page affichée, lien vers l'autre et
	 * texte d'une liste vide ; null si le forum n'est pas coupé.
	 */
	age: { old: boolean; info: string | null; toggle: { href: string; label: string } } | null;
	emptyMessage: string;
	/** Abonnement au forum (membres, o_forum_subscriptions). */
	subscription: { subscribed: boolean; href: string } | null;
	markReadUrl: string | null;
}

export interface ForumPageInput {
	viewer: Viewer;
	config: BoardConfig;
	forum: ForumInfo;
	topics: readonly TopicSummary[];
	tracked: TrackedTopics;
	censor: Censor | null;
	page: number;
	numPages: number;
	/** Liste coupée : page des anciennes ou des récentes, et nombre de discussions de l'autre page. */
	age: { old: boolean; days: number; otherCount: number } | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** URL d'une page du forum (la page 1 n'a pas de paramètre p) ; `old` : anciennes discussions. */
export function forumUrl(forumId: number, page = 1, old = false): string {
	return `viewforum.php?id=${forumId}${old ? '&old=1' : ''}${page > 1 ? `&p=${page}` : ''}`;
}

/** Nouveaux messages dans un sujet (viewforum.php) : après la dernière visite et les lectures suivies. */
function hasNewPosts(topic: TopicSummary, forumId: number, viewer: Viewer, tracked: TrackedTopics): boolean {
	if (viewer.isGuest || topic.movedTo !== null || topic.lastPost === null) return false;
	const at = topic.lastPost.postedAt;
	const topicRead = tracked.topics.get(topic.id);
	const forumRead = tracked.forums.get(forumId);
	return at > viewer.lastVisit && (topicRead === undefined || topicRead < at) && (forumRead === undefined || forumRead < at);
}

/** Contexte commun à toutes les lignes de sujet d'une page (viewforum, résultats de recherche). */
export interface TopicRowContext {
	viewer: Viewer;
	config: BoardConfig;
	tracked: TrackedTopics;
	censor: Censor | null;
	dateWords: DateWords;
	now: number;
}

/** Ligne d'un sujet : statut, balises colorées, nouveaux messages, mini-pagination, compteurs. */
export function buildTopicRow(topic: TopicSummary, forumId: number, context: TopicRowContext): TopicRowView {
	const { viewer, config, censor } = context;
	const moved = topic.movedTo !== null;
	const subject = censor !== null ? censor(topic.subject) : topic.subject;
	const topicPages = pageCount(topic.numReplies + 1, viewer.postsPerPage ?? config.defaultPostsPerPage);
	const isNew = hasNewPosts(topic, forumId, viewer, context.tracked);

	return {
		id: topic.id,
		href: topicUrl(topic.movedTo ?? topic.id),
		subject: subjectSegments(subject, config.subjectTags),
		subjectText: subject,
		poster: topic.poster,
		sticky: topic.sticky,
		closed: topic.closed && !moved,
		moved,
		newPostsUrl: isNew ? `viewtopic.php?id=${topic.id}&action=new` : null,
		hasPosted: config.showDot && !viewer.isGuest && topic.hasPosted,
		pages:
			topicPages > 1
				? paginationLinks(topicPages, 1, (page) => topicUrl(topic.id, page)).map((link) =>
						link.kind === 'page' ? { ...link, current: false } : link,
					)
				: [],
		replies: moved ? '-' : forumNumberFormat(topic.numReplies),
		views: moved ? '-' : forumNumberFormat(topic.numViews),
		lastPost:
			!moved && topic.lastPost !== null
				? {
						href: `viewtopic.php?pid=${topic.lastPost.postId}#p${topic.lastPost.postId}`,
						at: formatTime(topic.lastPost.postedAt, viewerTimeSettings(viewer), context.dateWords, context.now),
						by: topic.lastPost.poster,
					}
				: null,
	};
}

export function buildForumPage(input: ForumPageInput): ForumPageView {
	const { viewer, config, forum, lang } = input;
	const topics = input.topics.map((topic) => buildTopicRow(topic, forum.id, input));

	const member = !viewer.isGuest;

	return {
		forum: { id: forum.id, name: forum.name, links: projectLinkViews(forum.links, lang) },
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: forum.name, href: forumUrl(forum.id) }),
		pagination: paginationLinks(input.numPages, input.page, (page) => forumUrl(forum.id, page, input.age?.old ?? false)),
		postTopicUrl: canPostTopic(viewer, forum) ? `post.php?fid=${forum.id}` : null,
		topics,
		subscription:
			member && config.forumSubscriptions
				? {
						subscribed: forum.isSubscribed,
						href: `misc.php?action=${forum.isSubscribed ? 'unsubscribe' : 'subscribe'}&fid=${forum.id}`,
					}
				: null,
		markReadUrl: member ? `misc.php?action=markforumread&fid=${forum.id}` : null,
		// Pas de bouton vers une page des anciennes discussions vide.
		age:
			input.age === null || (!input.age.old && input.age.otherCount === 0)
				? null
				: {
						old: input.age.old,
						info: input.age.old ? lang.forum.oldTopicsInfo(input.age.days) : null,
						toggle: {
							href: forumUrl(forum.id, 1, !input.age.old),
							label: input.age.old ? lang.forum.recentTopics(input.age.otherCount) : lang.forum.oldTopics(input.age.otherCount),
						},
					},
		emptyMessage: input.age === null ? lang.forum.emptyForum : input.age.old ? lang.forum.noOldTopics : lang.forum.noRecentTopics,
	};
}
