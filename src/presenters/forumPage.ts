/**
 * Modèle de vue de viewforum.php : liste des sujets d'un forum. Fonction pure.
 */

import type { BoardConfig, ForumInfo, TopicLabel, TopicSummary, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { pageCount } from '../services/pagination.ts';
import { canPostTopic } from '../services/permissions.ts';
import { labelCss, labelledSubject, styleSubject } from '../services/topicLabels.ts';
import type { TrackedTopics } from '../services/trackedTopics.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';
import { topicUrl } from './topicPage.ts';

export interface SubjectPartView {
	text: string;
	/** Style CSS en ligne de la balise PV (valeurs validées), ou null pour du texte simple. */
	css: string | null;
}

export interface TopicRowView {
	id: number;
	href: string;
	subject: SubjectPartView[];
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
	forum: { id: number; name: string };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	postTopicUrl: string | null;
	topics: TopicRowView[];
	/** Abonnement au forum (membres, o_forum_subscriptions). */
	subscription: { subscribed: boolean; href: string } | null;
	markReadUrl: string | null;
}

export interface ForumPageInput {
	viewer: Viewer;
	config: BoardConfig;
	forum: ForumInfo;
	topics: readonly TopicSummary[];
	/** Balises posées, par sujet, et définitions de toutes les balises (mise en couleur). */
	topicLabels: ReadonlyMap<number, readonly TopicLabel[]>;
	labelDefinitions: readonly TopicLabel[];
	tracked: TrackedTopics;
	censor: Censor | null;
	page: number;
	numPages: number;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** URL d'une page du forum (la page 1 n'a pas de paramètre p). */
export function forumUrl(forumId: number, page = 1): string {
	return page > 1 ? `viewforum.php?id=${forumId}&p=${page}` : `viewforum.php?id=${forumId}`;
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
	labelDefinitions: readonly TopicLabel[];
	dateWords: DateWords;
	now: number;
}

/** Ligne d'un sujet : statut, balises PV colorées, nouveaux messages, mini-pagination, compteurs. */
export function buildTopicRow(topic: TopicSummary, forumId: number, labels: readonly TopicLabel[], context: TopicRowContext): TopicRowView {
	const { viewer, config, censor } = context;
	const moved = topic.movedTo !== null;
	const subject = labelledSubject(censor !== null ? censor(topic.subject) : topic.subject, labels);
	const topicPages = pageCount(topic.numReplies + 1, viewer.postsPerPage ?? config.defaultPostsPerPage);
	const isNew = hasNewPosts(topic, forumId, viewer, context.tracked);

	return {
		id: topic.id,
		href: topicUrl(topic.movedTo ?? topic.id),
		subject: styleSubject(subject, context.labelDefinitions).map((part) => ({
			text: part.text,
			css: part.style !== null ? labelCss(part.style) : null,
		})),
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
	const topics = input.topics.map((topic) => buildTopicRow(topic, forum.id, input.topicLabels.get(topic.id) ?? [], input));

	const member = !viewer.isGuest;

	return {
		forum: { id: forum.id, name: forum.name },
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: forum.name, href: forumUrl(forum.id) }),
		pagination: paginationLinks(input.numPages, input.page, (page) => forumUrl(forum.id, page)),
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
	};
}
