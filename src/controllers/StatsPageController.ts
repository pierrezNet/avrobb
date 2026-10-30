/**
 * Page Statistiques (stats.php, AvroBB, liée dans le pied de page) : les totaux qu'affichait le bloc
 * « Informations sur les forums » de l'index, remplacé par l'activité de la semaine.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildStatsPage } from '../presenters/statsPage.ts';
import type { StatsReader } from '../repositories/StatsRepository.ts';
import type { UsersInfoReader } from '../repositories/UsersInfoLoader.ts';

export interface StatsPageControllerDeps extends LayoutDeps {
	stats: StatsReader;
	usersInfo: UsersInfoReader;
}

export class StatsPageController {
	constructor(private readonly deps: StatsPageControllerDeps) {}

	show = async (request: AppRequest, reply: AppReply): Promise<AppReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;
		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		const [usersInfo, totals, online] = await Promise.all([
			this.deps.usersInfo.load(),
			this.deps.stats.countTopicsAndPosts(),
			config.usersOnline ? this.deps.stats.listOnline() : null,
		]);
		const view = buildStatsPage({ viewer, usersInfo, totals, online, lang });
		return renderPage(
			request,
			reply,
			this.deps,
			'stats.njk',
			{ pageId: 'stats', titleParts: [config.boardTitle, view.title], allowIndex: true, canonicalUrl: 'stats.php' },
			view,
		);
	};
}
