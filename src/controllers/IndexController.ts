/**
 * Contrôleur de l'index (index.php, aussi servi à la racine du site).
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildIndexPage } from '../presenters/indexPage.ts';
import type { AvatarLocator } from '../repositories/AvatarFiles.ts';
import type { ForumReader } from '../repositories/ForumRepository.ts';
import type { HomeActivityReader } from '../repositories/HomeActivityRepository.ts';
import type { StatsReader } from '../repositories/StatsRepository.ts';
import type { TopicReader } from '../repositories/TopicRepository.ts';
import type { TranslationReader } from '../repositories/TranslationRepository.ts';
import { HOME_WEEK } from '../services/homeActivity.ts';
import { parseTrackedTopics } from '../services/trackedTopics.ts';
import { withTranslatedForums, withTranslatedSubjects } from './contentTranslations.ts';

export interface IndexControllerDeps extends LayoutDeps {
	forums: ForumReader;
	translations: TranslationReader;
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

	show = async (request: AppRequest, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);

		const weekStart = this.deps.page.clock() - HOME_WEEK;
		const [indexCategories, recentTopics, online, indexHotTopics, newMembers, activeSubjects] = await Promise.all([
			this.deps.forums.listIndex(viewer.group.id),
			viewer.isGuest ? [] : this.deps.topics.listUpdatedSince(viewer.group.id, viewer.lastVisit),
			config.usersOnline ? this.deps.stats.listOnline() : null,
			this.deps.homeActivity.listHotTopics(viewer.group.id, weekStart, HOT_TOPICS),
			this.deps.homeActivity.listNewMembers(weekStart, NEW_MEMBERS),
			this.deps.homeActivity.listActiveSubjects(viewer.group.id, weekStart),
		]);
		const { locale } = this.deps.page;
		const [forums, hotTopics] = await Promise.all([
			withTranslatedForums(
				this.deps.translations,
				indexCategories.flatMap((category) => category.forums),
				locale,
			),
			withTranslatedSubjects(this.deps.translations, indexHotTopics, locale),
		]);
		const shownForums = new Map(forums.map((forum) => [forum.id, forum]));
		const categories = indexCategories.map((category) => ({
			...category,
			forums: category.forums.map((forum) => shownForums.get(forum.id) ?? forum),
		}));
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
