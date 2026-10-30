/**
 * Contrôleur de viewforum.php : liste paginée des sujets d'un forum.
 */

import type { TopicAgeFilter } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildForumPage, forumUrl } from '../presenters/forumPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface ForumControllerDeps extends LayoutDeps {
	forums: ForumReader;
	topics: TopicReader;
	censorship: CensorReader;
	trackCookieName: string;
}

export interface ForumQuery {
	id?: string;
	p?: string;
	/** Anciennes discussions (o_cold_topic_days). */
	old?: string;
}

export class ForumController {
	constructor(private readonly deps: ForumControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: ForumQuery }>, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const id = positiveInt(request.query.id);
		const forum = id > 0 ? await this.deps.forums.findReadable(id, viewer.group.id, viewer.isGuest ? null : viewer.id) : null;
		if (forum === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		// Forum de redirection : viewforum.php renvoie directement vers son adresse.
		if (forum.redirectUrl !== null) return reply.redirect(forum.redirectUrl);

		const now = this.deps.page.clock();
		const age: TopicAgeFilter | null =
			config.coldTopicDays > 0 ? { before: now - config.coldTopicDays * 86400, old: request.query.old === '1' } : null;
		const [count, otherCount] =
			age !== null
				? await Promise.all([
						this.deps.topics.countForumTopics(forum.id, age),
						this.deps.topics.countForumTopics(forum.id, { ...age, old: !age.old }),
					])
				: [forum.numTopics, 0];

		const perPage = viewer.topicsPerPage ?? config.defaultTopicsPerPage;
		const numPages = pageCount(count, perPage);
		const page = clampPage(request.query.p, numPages);

		const topics = await this.deps.topics.listForumPage(
			forum.id,
			forum.sortBy,
			(page - 1) * perPage,
			perPage,
			config.showDot && !viewer.isGuest ? viewer.id : null,
			age,
		);
		const censoredWords = config.censoring ? await this.deps.censorship.listWords() : [];

		const view = buildForumPage({
			viewer,
			config,
			forum,
			topics,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			censor: config.censoring ? buildCensor(censoredWords) : null,
			page,
			numPages,
			age: age !== null ? { old: age.old, days: config.coldTopicDays, otherCount } : null,
			lang,
			dateWords: this.deps.page.dateWords,
			now,
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'viewforum.njk',
			{
				pageId: 'viewforum',
				titleParts: [config.boardTitle, forum.name, ...(age?.old ? [lang.forum.oldTopicsTitle] : [])],
				pageNumber: page,
				activeNav: 'index',
				footer: { kind: 'viewforum', forum, page },
				allowIndex: true,
				canonicalUrl: forumUrl(forum.id, page, age?.old ?? false, forum.name),
				description: lang.forum.metaDescription(forum.name, config.boardTitle),
			},
			view,
		);
	};
}
