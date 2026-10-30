/**
 * Construction des flux d'extern.php à partir des lignes lues en base. Fonctions pures.
 */

import type { BoardConfig, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import type { FeedPostRow, FeedTopicRow } from '../repositories/FeedRepository.ts';
import { type BbcodeOptions, parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import type { Feed, FeedItem } from '../services/feeds.ts';
import { postPath, topicPath } from '../services/routes.ts';

export interface FeedInput {
	viewer: Viewer;
	config: BoardConfig;
	censor: Censor | null;
	lang: Lang;
}

/**
 * Le PHP rend les messages avec les préférences du lecteur (le plus souvent l'invité), sans
 * réglage propre au flux : on fait de même.
 */
function render(row: FeedPostRow, input: FeedInput): string {
	const { config, viewer, censor, lang } = input;
	const options: BbcodeOptions = {
		bbcode: config.bbcode,
		imgTag: config.imgTag,
		showImages: viewer.showImages,
		smilies: config.smilies && viewer.showSmilies && !row.hideSmilies,
		censor,
		baseUrl: config.baseUrl,
		indentSpaces: config.indentSpaces,
		labels: { wrote: lang.common.wrote, imageLink: lang.common.imageLink, spoiler: lang.common.spoiler, video: lang.common.video },
	};
	return parseMessage(row.message, options);
}

function author(name: string, row: FeedPostRow, input: FeedInput): FeedItem['author'] {
	const base = input.config.baseUrl;
	return {
		name,
		// Les adresses ne sont données qu'aux membres connectés, comme extern.php.
		email: input.viewer.isGuest ? null : row.publicEmail,
		uri: row.posterId > 1 ? `${base}/profile.php?id=${row.posterId}` : null,
	};
}

/** Flux d'une discussion (tid) : ses derniers messages. */
export function buildTopicFeed(
	topic: { id: number; subject: string; firstPostId: number },
	posts: readonly FeedPostRow[],
	input: FeedInput,
): Feed {
	const { config, lang, censor } = input;
	const subject = censor !== null ? censor(topic.subject) : topic.subject;
	const base = config.baseUrl;

	return {
		title: `${config.boardTitle}${lang.common.titleSeparator}${subject}`,
		link: `${base}${topicPath(topic.id, subject)}`,
		description: lang.common.rssDescriptionTopic(subject),
		type: 'posts',
		items: posts.map((post) => ({
			id: post.id,
			title: post.id === topic.firstPostId ? subject : `${lang.common.rssReply}${subject}`,
			link: `${base}${postPath(post.id)}`,
			description: render(post, input),
			author: author(post.poster, post, input),
			pubDate: post.posted,
		})),
	};
}

/** Flux des discussions récentes, éventuellement limité à un forum (dont le nom s'ajoute au titre). */
export function buildTopicsFeed(rows: readonly FeedTopicRow[], forumName: string | null, orderPosted: boolean, input: FeedInput): Feed {
	const { config, lang, censor } = input;
	const base = config.baseUrl;

	return {
		title: `${config.boardTitle}${forumName !== null ? `${lang.common.titleSeparator}${forumName}` : ''}`,
		link: `${base}/`,
		description: lang.common.rssDescription(config.boardTitle),
		type: 'topics',
		items: rows.map((row) => ({
			id: row.topicId,
			title: censor !== null ? censor(row.subject) : row.subject,
			link: `${base}${topicPath(row.topicId, censor !== null ? censor(row.subject) : row.subject)}${orderPosted ? '' : '?action=new'}`,
			description: render(row, input),
			author: author(orderPosted ? row.topicPoster : row.lastPoster, row, input),
			pubDate: orderPosted ? row.topicPosted : row.lastPost,
		})),
	};
}
