/**
 * Modèles de vue de moderate.php : liste des sujets d'un forum à modérer, messages d'un sujet à
 * modérer, choix d'un forum de destination. Fonctions pures.
 */

import {
	type BoardConfig,
	type ForumInfo,
	type ForumTarget,
	GroupId,
	type ModeratedTopic,
	type Post,
	type TopicSummary,
	type Viewer,
} from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import type { TrackedTopics } from '../services/trackedTopics.ts';
import { userTitle } from '../services/userTitle.ts';
import { buildTopicRow, type TopicRowView } from './forumPage.ts';
import { type Crumb, crumbs, type PaginationLink, paginationLinks } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';
import { topicUrl } from './topicPage.ts';

export interface ModerateForumView {
	forum: { id: number; name: string };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	formAction: string;
	topics: (TopicRowView & { selectLabel: string })[];
	notice: string | null;
	errors: string[];
}

export function buildModerateForum(input: {
	viewer: Viewer;
	config: BoardConfig;
	forum: ForumInfo;
	topics: readonly TopicSummary[];
	tracked: TrackedTopics;
	censor: Censor | null;
	page: number;
	numPages: number;
	lang: Lang;
	dateWords: DateWords;
	now: number;
	notice: string | null;
	errors: string[];
}): ModerateForumView {
	const { forum, lang } = input;
	return {
		forum: { id: forum.id, name: forum.name },
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: forum.name, href: `viewforum.php?id=${forum.id}` },
			{ label: lang.moderate.moderate, href: `moderate.php?fid=${forum.id}` },
		),
		pagination: paginationLinks(input.numPages, input.page, (page) => `moderate.php?fid=${forum.id}${page > 1 ? `&p=${page}` : ''}`),
		formAction: `moderate.php?fid=${forum.id}`,
		topics: input.topics.map((topic) => {
			const row = buildTopicRow(topic, forum.id, input);
			return { ...row, selectLabel: lang.moderate.selectTopic(row.subjectText) };
		}),
		notice: input.notice,
		errors: input.errors,
	};
}

export interface ModeratedPostView {
	id: number;
	number: number;
	permalink: string;
	postedAt: string;
	poster: { href: string | null; label: string };
	userTitle: string;
	/** HTML de parseMessage() (échappé par construction). */
	messageHtml: string;
	edited: { by: string; at: string } | null;
	/** Le premier message ne peut être ni scindé ni supprimé. */
	selectable: boolean;
	selectLabel: string;
}

export interface ModerateTopicView {
	topic: { id: number; subject: string };
	crumbs: Crumb[];
	pagination: PaginationLink[];
	formAction: string;
	posts: ModeratedPostView[];
	/** Sans réponse, il n'y a rien à scinder ni à supprimer. */
	hasReplies: boolean;
	errors: string[];
}

export function buildModerateTopic(input: {
	viewer: Viewer;
	config: BoardConfig;
	topic: ModeratedTopic;
	posts: readonly Post[];
	firstPosition: number;
	page: number;
	numPages: number;
	bannedUsernames: ReadonlySet<string>;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
	errors: string[];
}): ModerateTopicView {
	const { viewer, config, topic, lang, censor } = input;
	const censored = (text: string): string => (censor !== null ? censor(text) : text);
	const time = viewerTimeSettings(viewer);
	const subject = censored(topic.subject);
	const titleWords = { banned: lang.common.banned, guest: lang.common.guest, member: lang.common.member };
	const base = `moderate.php?fid=${topic.forum.id}&tid=${topic.id}`;

	return {
		topic: { id: topic.id, subject },
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: topic.forum.name, href: `viewforum.php?id=${topic.forum.id}` },
			{ label: subject, href: topicUrl(topic.id) },
			{ label: lang.moderate.moderate, href: base },
		),
		pagination: paginationLinks(input.numPages, input.page, (page) => `${base}${page > 1 ? `&p=${page}` : ''}`),
		formAction: base,
		posts: input.posts.map((post, index) => {
			const number = input.firstPosition + index;
			const author = post.author;
			const title =
				author !== null
					? userTitle(
							{ username: post.username, title: author.title, groupId: author.groupId, groupUserTitle: author.groupUserTitle },
							input.bannedUsernames,
							titleWords,
						)
					: lang.common.guest;
			return {
				id: post.id,
				number,
				permalink: `viewtopic.php?pid=${post.id}#p${post.id}`,
				postedAt: formatTime(post.posted, time, input.dateWords, input.now),
				poster: { href: author !== null && viewer.group.canViewUsers ? `profile.php?id=${author.id}` : null, label: post.username },
				userTitle: author !== null && author.groupId !== GroupId.Guest ? censored(title) : title,
				messageHtml: parseMessage(post.message, messageParserOptions(config, viewer, lang, censor, post.hideSmilies)),
				edited: post.edited !== null ? { by: post.editedBy, at: formatTime(post.edited, time, input.dateWords, input.now) } : null,
				selectable: post.id !== topic.firstPostId,
				selectLabel: lang.moderate.selectPost(number),
			};
		}),
		hasReplies: topic.numReplies > 0,
		errors: input.errors,
	};
}

export interface ForumChoiceView {
	categories: { name: string; forums: { id: number; name: string; selected: boolean }[] }[];
}

/** Forums de destination groupés par catégorie, sans `excludeId` (déplacement) et avec `selectedId` choisi. */
export function buildForumChoice(targets: readonly ForumTarget[], excludeId: number | null, selectedId: number | null): ForumChoiceView {
	const categories: ForumChoiceView['categories'] = [];
	let currentCategory: number | null = null;
	for (const target of targets) {
		if (target.forumId === excludeId) continue;
		let category = categories.at(-1);
		if (category === undefined || currentCategory !== target.categoryId) {
			category = { name: target.categoryName, forums: [] };
			categories.push(category);
			currentCategory = target.categoryId;
		}
		category.forums.push({ id: target.forumId, name: target.forumName, selected: target.forumId === selectedId });
	}
	return { categories };
}
