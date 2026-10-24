/**
 * Contrôleur de l'index (index.php, aussi servi à la racine du site).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildIndexPage } from '../presenters/indexPage.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { StatsReader } from '../repositories/StatsRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import type { UsersInfoReader } from '../repositories/UsersInfoLoader.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';

export interface IndexControllerDeps extends LayoutDeps {
	forums: ForumReader;
	topics: TopicReader;
	stats: StatsReader;
	usersInfo: UsersInfoReader;
	/** Nom du cookie de suivi des sujets lus (<cookie_name>_track). */
	trackCookieName: string;
}

export class IndexController {
	constructor(private readonly deps: IndexControllerDeps) {}

	show = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const [categories, recentTopics, usersInfo, totals, online] = await Promise.all([
			this.deps.forums.listIndex(viewer.group.id),
			viewer.isGuest ? [] : this.deps.topics.listUpdatedSince(viewer.group.id, viewer.lastVisit),
			this.deps.usersInfo.load(),
			this.deps.stats.countTopicsAndPosts(),
			config.usersOnline ? this.deps.stats.listOnline() : null,
		]);

		const view = buildIndexPage({
			viewer,
			config,
			categories,
			recentTopics,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			usersInfo,
			totals,
			online,
			lang,
			dateWords: this.deps.page.dateWords,
			now: this.deps.page.clock(),
		});

		return renderPage(
			request,
			reply,
			this.deps,
			'index.njk',
			{
				pageId: 'index',
				titleParts: [config.boardTitle],
				activeNav: 'index',
				footer: { kind: 'index' },
				allowIndex: true,
				canonicalUrl: 'index.php',
			},
			view,
		);
	};
}
