/**
 * Contrôleur de viewforum.php : liste paginée des sujets d'un forum.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildForumPage, forumUrl } from '../presenters/forumPage.ts';
import type { CensorReader } from '../repositories/CensorRepository.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { TopicLabelReader } from '../repositories/TopicLabelRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import { buildCensor } from '../services/censor.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';
import { positiveInt } from './params.ts';

export interface ForumControllerDeps extends LayoutDeps {
	forums: ForumReader;
	topics: TopicReader;
	topicLabels: TopicLabelReader;
	censorship: CensorReader;
	trackCookieName: string;
}

export interface ForumQuery {
	id?: string;
	p?: string;
}

export class ForumController {
	constructor(private readonly deps: ForumControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: ForumQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const id = positiveInt(request.query.id);
		const forum = id > 0 ? await this.deps.forums.findReadable(id, viewer.group.id, viewer.isGuest ? null : viewer.id) : null;
		if (forum === null) return renderMessage(request, reply, this.deps, 404, lang.common.badRequest);

		// Forum de redirection : viewforum.php renvoie directement vers son adresse.
		if (forum.redirectUrl !== null) return reply.redirect(forum.redirectUrl);

		const perPage = viewer.topicsPerPage ?? config.defaultTopicsPerPage;
		const numPages = pageCount(forum.numTopics, perPage);
		const page = clampPage(request.query.p, numPages);

		const topics = await this.deps.topics.listForumPage(
			forum.id,
			forum.sortBy,
			(page - 1) * perPage,
			perPage,
			config.showDot && !viewer.isGuest ? viewer.id : null,
		);
		const [topicLabels, labelDefinitions, censoredWords] = await Promise.all([
			this.deps.topicLabels.listForTopics(topics.map((topic) => topic.id)),
			this.deps.topicLabels.listDefinitions(),
			config.censoring ? this.deps.censorship.listWords() : [],
		]);

		const view = buildForumPage({
			viewer,
			config,
			forum,
			topics,
			topicLabels,
			labelDefinitions,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			censor: config.censoring ? buildCensor(censoredWords) : null,
			page,
			numPages,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'viewforum.njk',
			{
				pageId: 'viewforum',
				titleParts: [config.boardTitle, forum.name],
				pageNumber: page,
				activeNav: 'index',
				footer: { kind: 'viewforum', forum, page },
				allowIndex: true,
				canonicalUrl: forumUrl(forum.id, page),
			},
			view,
		);
	};
}
