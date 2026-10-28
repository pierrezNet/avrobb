/**
 * Modèle de vue de la page Statistiques (stats.php, AvroBB) : totaux du forum, dernier inscrit et
 * présents, sortis de l'accueil. Présentée comme une page d'information. Fonction pure.
 */

import type { OnlineVisitor, UsersInfo, Viewer } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { forumNumberFormat } from '../services/numberFormat.ts';
import type { PersonLink } from './indexPage.ts';
import { type Crumb, crumbs } from './navigation.ts';

export interface StatsPageView {
	title: string;
	crumbs: Crumb[];
	groups: { title: string; rows: { label: string; value: string | null; person: PersonLink | null }[] }[];
}

export function buildStatsPage(input: {
	viewer: Viewer;
	usersInfo: UsersInfo;
	totals: { topics: number; posts: number };
	/** null si o_users_online est désactivé. */
	online: readonly OnlineVisitor[] | null;
	lang: Lang;
}): StatsPageView {
	const { lang, viewer } = input;
	const t = lang.index;
	const newest = input.usersInfo.newestUser;
	const members = input.online?.filter((visitor) => visitor.userId > 1).length ?? 0;
	const value = (label: string, n: number) => ({ label, value: forumNumberFormat(n), person: null });
	return {
		title: lang.common.footerStats,
		crumbs: crumbs({ label: lang.common.index, href: 'index.php' }, { label: lang.common.footerStats, href: 'stats.php' }),
		groups: [
			{
				title: t.boardStats,
				rows: [
					value(t.totalUsers, input.usersInfo.totalUsers),
					value(t.totalTopics, input.totals.topics),
					value(t.totalPosts, input.totals.posts),
				],
			},
			{
				title: t.userInfo,
				rows: [
					...(newest !== null
						? [
								{
									label: t.newestUser,
									value: null,
									person: { label: newest.username, href: viewer.group.canViewUsers ? `profile.php?id=${newest.id}` : null },
								},
							]
						: []),
					...(input.online !== null ? [value(t.usersOnline, members), value(t.guestsOnline, input.online.length - members)] : []),
				],
			},
		],
	};
}
