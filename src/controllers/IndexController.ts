/**
 * Contrôleur de l'index (index.php, aussi servi à la racine du site).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildIndexPage } from '../presenters/indexPage.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { HomeActivityReader } from '../repositories/HomeActivityRepository.ts';
import type { StatsReader } from '../repositories/StatsRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import type { AvatarLocator } from '../services/avatars.ts';
import { HOME_WEEK } from '../services/homeActivity.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';

export interface IndexControllerDeps extends LayoutDeps {
	forums: ForumReader;
	topics: TopicReader;
	stats: StatsReader;
	homeActivity: HomeActivityReader;
	avatars: AvatarLocator;
	/** Nom du cookie de suivi des sujets lus (<cookie_name>_track). */
	trackCookieName: string;
}

/** Discussions de « Ça discute cette semaine », nouveaux membres et avatars affichés au plus. */
const HOT_TOPICS = 4;
const NEW_MEMBERS = 12;
const ONLINE_AVATARS = 40;

export class IndexController {
	constructor(private readonly deps: IndexControllerDeps) {}

	show = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const weekStart = this.deps.page.clock() - HOME_WEEK;
		const [categories, recentTopics, online, hotTopics, newMembers, activeSubjects] = await Promise.all([
			this.deps.forums.listIndex(viewer.group.id),
			viewer.isGuest ? [] : this.deps.topics.listUpdatedSince(viewer.group.id, viewer.lastVisit),
			config.usersOnline ? this.deps.stats.listOnline() : null,
			this.deps.homeActivity.listHotTopics(viewer.group.id, weekStart, HOT_TOPICS),
			this.deps.homeActivity.listNewMembers(weekStart, NEW_MEMBERS),
			this.deps.homeActivity.listActiveSubjects(viewer.group.id, weekStart),
		]);
		const members = (online ?? []).filter((visitor) => visitor.userId > 1).slice(0, ONLINE_AVATARS);
		const [hotTopicImages, avatarUrls] = await Promise.all([
			this.deps.homeActivity.findLatestImageMessages(hotTopics.map((topic) => topic.id)),
			config.avatars ? Promise.all(members.map((visitor) => this.deps.avatars.urlFor(visitor.userId, config.avatarsDir))) : [],
		]);
		const avatars = new Map(members.map((visitor, index) => [visitor.userId, avatarUrls[index] ?? null]));

		const view = buildIndexPage({
			viewer,
			config,
			categories,
			recentTopics,
			tracked: parseTrackedTopics(request.cookies[this.deps.trackCookieName]),
			online,
			avatars,
			hotTopics,
			hotTopicImages,
			newMembers,
			activeSubjects,
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
