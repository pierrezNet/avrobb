/**
 * Modèles de vue de search.php : formulaire de recherche et page de résultats (discussions ou
 * messages). Fonctions pures.
 */

import type { BoardConfig, ForumCategory, SearchPost, SearchTopic, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import { isAnyModerator } from '../services/permissions.ts';
import { forumPath, topicPath } from '../services/routes.ts';
import type { SearchOutcome, SearchType, ShowAs, SortBy } from '../services/search.ts';
import type { TrackedTopics } from '../services/trackedTopics.ts';
import { buildTopicRow, type TopicRowView } from './forumPage.ts';
import type { PersonLink } from './indexPage.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';

export interface SearchFormView {
	/** Cases à cocher (plusieurs forums) ou liste à choix unique (o_search_all_forums désactivé). */
	multipleForums: boolean;
	categories: { name: string; forums: { id: number; name: string }[] }[];
	sorts: { value: SortBy; label: string }[];
}

export function buildSearchForm(viewer: Viewer, config: BoardConfig, forums: readonly ForumCategory[], lang: Lang): SearchFormView {
	const t = lang.search;
	return {
		multipleForums: config.searchAllForums || isAnyModerator(viewer),
		categories: forums
			.map((category) => ({
				name: category.name,
				forums: category.forums.filter((forum) => !forum.isRedirect).map(({ id, name }) => ({ id, name })),
			}))
			.filter((category) => category.forums.length > 0),
		sorts: [
			{ value: 0, label: t.sortByPostTime },
			{ value: 1, label: t.sortByAuthor },
			{ value: 2, label: t.sortBySubject },
			{ value: 3, label: t.sortByForum },
		],
	};
}

export interface PostResultView {
	id: number;
	number: number;
	permalink: string;
	topicHref: string;
	forumHref: string;
	forumName: string;
	subject: string;
	isFirstPost: boolean;
	postedAt: string;
	poster: PersonLink;
	/** Nombre de réponses, affiché sous le premier message d'une discussion. */
	replies: string | null;
	isNew: boolean;
	/** HTML de parseMessage() (échappé par construction). */
	messageHtml: string;
}

export interface SearchResultsView {
	crumbs: Crumb[];
	pagination: PaginationLink[];
	showAs: ShowAs;
	topics: (TopicRowView & { forumName: string; forumHref: string })[];
	posts: PostResultView[];
	markReadUrl: string | null;
}

export interface SearchResultsInput {
	viewer: Viewer;
	config: BoardConfig;
	outcome: SearchOutcome;
	topics: readonly SearchTopic[];
	posts: readonly SearchPost[];
	tracked: TrackedTopics;
	censor: Censor | null;
	/** Pseudo du membre d'une recherche rapide show_user_* / show_subscriptions. */
	username: string | null;
	page: number;
	numPages: number;
	firstPosition: number;
	/** URL de la page n des résultats. */
	pageUrl: (page: number) => string;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

/** Lien qui relance la recherche (fil d'Ariane), au format de search.php. */
export function keywordSearchUrl(
	type: Extract<SearchType, { kind: 'keywords' | 'author' | 'both' }>,
	sortBy: SortBy,
	sortDir: 'ASC' | 'DESC',
	showAs: ShowAs,
	page = 1,
): string {
	const params = new URLSearchParams({
		action: 'search',
		keywords: type.keywords,
		author: type.author,
		forums: type.forums.join(','),
		search_in: String(type.searchIn),
		sort_by: String(sortBy),
		sort_dir: sortDir,
		show_as: showAs,
	});
	if (page > 1) params.set('p', String(page));
	return `search.php?${params.toString()}`;
}

/** Libellé et lien de la recherche dans le fil d'Ariane (search.php). */
function searchCrumb(input: SearchResultsInput): { label: string; href: string } {
	const { outcome, lang } = input;
	const t = lang.search;
	const type = outcome.type;
	const name = input.username ?? '';

	if (type.kind === 'action') {
		const user = type.userId !== null ? `&user_id=${type.userId}` : '';
		const href = `search.php?action=${type.action}${user}`;
		switch (type.action) {
			case 'show_user_topics':
			case 'show_user_posts':
			case 'show_subscriptions':
				return { label: t.quick[type.action](name), href };
			default:
				return { label: t.quick[type.action], href };
		}
	}

	const label =
		type.kind === 'both'
			? t.byBoth[outcome.showAs](type.keywords, type.author)
			: type.kind === 'keywords'
				? t.byKeywords[outcome.showAs](type.keywords)
				: t.byUser[outcome.showAs](type.author);
	return { label, href: keywordSearchUrl(type, outcome.sortBy, outcome.sortDir, outcome.showAs) };
}

function isNewPost(post: SearchPost, viewer: Viewer, tracked: TrackedTopics): boolean {
	if (viewer.isGuest || post.topicLastPost <= viewer.lastVisit) return false;
	const topicRead = tracked.topics.get(post.topicId);
	const forumRead = tracked.forums.get(post.forumId);
	return (topicRead === undefined || topicRead < post.topicLastPost) && (forumRead === undefined || forumRead < post.topicLastPost);
}

export function buildSearchResults(input: SearchResultsInput): SearchResultsView {
	const { viewer, config, lang, censor } = input;
	const censored = (text: string): string => (censor !== null ? censor(text) : text);
	const time = viewerTimeSettings(viewer);
	const labels = { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video };

	const topics = input.topics.map((topic) => ({
		...buildTopicRow(topic, topic.forumId, input),
		forumName: topic.forumName,
		forumHref: forumPath(topic.forumId, topic.forumName),
	}));

	const posts = input.posts.map(
		(post, index): PostResultView => ({
			id: post.id,
			number: input.firstPosition + index,
			permalink: `viewtopic.php?pid=${post.id}#p${post.id}`,
			topicHref: topicPath(post.topicId, censored(post.subject)),
			forumHref: forumPath(post.forumId, post.forumName),
			forumName: post.forumName,
			subject: censored(post.subject),
			isFirstPost: post.id === post.firstPostId,
			postedAt: formatTime(post.posted, time, input.dateWords, input.now),
			poster: { label: post.poster, href: post.posterId > 1 && viewer.group.canViewUsers ? `profile.php?id=${post.posterId}` : null },
			replies: post.id === post.firstPostId ? forumNumberFormat(post.numReplies) : null,
			isNew: isNewPost(post, viewer, input.tracked),
			messageHtml: parseMessage(post.message, {
				bbcode: config.bbcode,
				imgTag: config.imgTag,
				showImages: viewer.showImages,
				smilies: config.smilies && viewer.showSmilies && !post.hideSmilies,
				censor,
				baseUrl: config.baseUrl,
				indentSpaces: config.indentSpaces,
				labels,
			}),
		}),
	);

	const crumb = searchCrumb(input);
	const showNew = input.outcome.type.kind === 'action' && input.outcome.type.action === 'show_new';

	return {
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: lang.search.searchCrumb, href: 'search.php' }, crumb),
		pagination: paginationLinks(input.numPages, input.page, input.pageUrl),
		showAs: input.outcome.showAs,
		topics,
		posts,
		markReadUrl: showNew && !viewer.isGuest ? 'misc.php?action=markread' : null,
	};
}
