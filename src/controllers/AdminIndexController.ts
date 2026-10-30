/**
 * Accueil de l'administration (admin_index.php) et statistiques du serveur (admin_statistics.php).
 *
 * Écarts assumés : pas de vérification de mise à jour (le site fluxbb.org ne la fournit plus) ni
 * de phpinfo() ; l'environnement affiché est celui de Node.js.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LayoutDeps } from '../http/layout.ts';
import type { AdminStatsReader } from '../repositories/AdminStatsRepository.ts';
import { fileSize, forumNumberFormat } from '../services/numberFormat.ts';
import { isAdmin } from '../services/permissions.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';

export interface AdminIndexControllerDeps extends LayoutDeps {
	adminStats: AdminStatsReader;
}

export class AdminIndexController {
	constructor(private readonly deps: AdminIndexControllerDeps) {}

	index = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		return renderAdminPage(request, reply, this.deps, { active: 'index', template: 'admin_index.njk', title: lang.admin.index }, {});
	};

	statistics = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.admin;
		const online = await this.deps.adminStats.countActiveOnline();
		// Base de données : administrateurs seulement, comme le PHP.
		const details = isAdmin(request.viewer) ? await this.deps.adminStats.databaseInfo() : null;
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'index', template: 'admin_statistics.njk', title: t.serverStatistics },
			{
				online: t.onlineData(online),
				database:
					details !== null
						? [details.version, t.databaseRows(forumNumberFormat(details.rows)), t.databaseSize(fileSize(details.bytes))]
						: null,
			},
		);
	};
}
