/**
 * Modèle de vue de delete.php : confirmation de la suppression d'un message (ou de toute la
 * discussion s'il l'ouvre), avec le message à revoir. Fonction pure.
 */

import type { BoardConfig, EditablePost, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { parseMessage } from '../services/bbcode.ts';
import type { Censor } from '../services/censor.ts';
import { type DateWords, formatTime, viewerTimeSettings } from '../services/dateFormat.ts';
import { forumPath } from '../services/routes.ts';
import { type Crumb, crumbs } from './navigation.ts';
import { messageParserOptions } from './parserOptions.ts';

export interface DeletePageView {
	crumbs: Crumb[];
	formAction: string;
	isTopicPost: boolean;
	poster: string;
	postedAt: string;
	/** HTML de parseMessage() (échappé par construction). */
	messageHtml: string;
}

export interface DeletePageInput {
	viewer: Viewer;
	config: BoardConfig;
	post: EditablePost;
	censor: Censor | null;
	lang: Lang;
	dateWords: DateWords;
	now: number;
}

export function buildDeletePage(input: DeletePageInput): DeletePageView {
	const { viewer, config, post, censor, lang } = input;
	const subject = censor !== null ? censor(post.topic.subject) : post.topic.subject;
	return {
		crumbs: crumbs(
			{ label: lang.common.index, href: 'index.php' },
			{ label: post.forum.name, href: forumPath(post.forum.id, post.forum.name) },
			{ label: subject, href: `viewtopic.php?pid=${post.id}#p${post.id}` },
			{ label: lang.delete.deletePost, href: `delete.php?id=${post.id}` },
		),
		formAction: `delete.php?id=${post.id}`,
		isTopicPost: post.id === post.topic.firstPostId,
		poster: post.poster,
		postedAt: formatTime(post.posted, viewerTimeSettings(viewer), input.dateWords, input.now),
		messageHtml: parseMessage(post.message, messageParserOptions(config, viewer, lang, censor, post.hideSmilies)),
	};
}
