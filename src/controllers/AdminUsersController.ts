/**
 * Utilisateurs dans l'administration (admin_users.php), pour les administrateurs et modérateurs :
 * formulaire de recherche, statistiques d'adresses IP d'un membre (ip_stats), membres ayant écrit
 * depuis une adresse (show_users), résultats de recherche (find_user).
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { buildIpPosters, buildIpStats, buildUserResults, buildUserSearchForm } from '../presenters/adminUsersPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { GroupAdminStore } from '../repositories/GroupAdminRepository.ts';
import type { UserAdminReader } from '../repositories/UserAdminRepository.ts';
import { isIpAddress } from '../services/hosts.ts';
import { readUserSearch } from '../services/userSearch.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

/** Lignes par page, comme le PHP. */
const PER_PAGE = 50;

export interface AdminUsersControllerDeps extends LayoutDeps {
	userAdmin: UserAdminReader;
	groupAdmin: GroupAdminStore;
	bans: Pick<BanReader, 'listBannedUsernames'>;
}

export type AdminUsersQuery = Record<string, string | undefined>;

/** Page demandée (1 si hors limites), comme le PHP. */
function pageOf(requested: string | undefined, numPages: number): number {
	const page = positiveInt(requested);
	return page >= 1 && page <= numPages ? page : 1;
}

export class AdminUsersController {
	constructor(private readonly deps: AdminUsersControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: AdminUsersQuery }>, reply: FastifyReply): Promise<FastifyReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const { query } = request;
		if (query.ip_stats !== undefined) return this.#ipStats(request, reply);
		if (query.show_users !== undefined) return this.#ipPosters(request, reply);
		if (query.find_user !== undefined) return this.#results(request, reply);

		const t = this.deps.page.lang.adminUsers;
		const groups = await this.deps.groupAdmin.listGroups();
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'users', template: 'admin_users.njk', title: t.title },
			buildUserSearchForm(groups, this.deps.page.lang),
		);
	};

	async #ipStats(request: FastifyRequest<{ Querystring: AdminUsersQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang, dateWords, clock } = this.deps.page;
		const userId = positiveInt(request.query.ip_stats);
		if (userId < 1) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const numPages = Math.ceil((await this.deps.userAdmin.countIpStats(userId)) / PER_PAGE);
		const page = pageOf(request.query.p, numPages);
		const stats = await this.deps.userAdmin.listIpStats(userId, (page - 1) * PER_PAGE, PER_PAGE);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'users', template: 'admin_users_ip_stats.njk', title: lang.adminUsers.resultsHead },
			buildIpStats({ userId, stats, page, numPages, viewer: request.viewer, dateWords, now: clock() }),
		);
	}

	async #ipPosters(request: FastifyRequest<{ Querystring: AdminUsersQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const ip = (request.query.show_users ?? '').trim();
		if (!isIpAddress(ip)) return renderMessage(request, reply, this.deps, 400, lang.adminUsers.badIp);
		const numPages = Math.ceil((await this.deps.userAdmin.countIpPosters(ip)) / PER_PAGE);
		const page = pageOf(request.query.p, numPages);
		const [posters, bannedUsernames] = await Promise.all([
			this.deps.userAdmin.listIpPosters(ip, (page - 1) * PER_PAGE, PER_PAGE),
			this.deps.bans.listBannedUsernames(),
		]);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'users', template: 'admin_users_results.njk', title: lang.adminUsers.resultsHead },
			buildIpPosters({ ip, posters, page, numPages, bannedUsernames, lang }),
		);
	}

	async #results(request: FastifyRequest<{ Querystring: AdminUsersQuery }>, reply: FastifyReply): Promise<FastifyReply> {
		const { lang } = this.deps.page;
		const search = readUserSearch((name) => request.query[name] ?? '');
		if (search.kind === 'nonNumeric') return renderMessage(request, reply, this.deps, 400, lang.adminUsers.nonNumeric);
		if (search.kind === 'invalidDate') return renderMessage(request, reply, this.deps, 400, lang.adminUsers.invalidDateTime);
		const numPages = Math.ceil((await this.deps.userAdmin.countUsers(search.criteria)) / PER_PAGE);
		const page = pageOf(request.query.p, numPages);
		const [users, bannedUsernames] = await Promise.all([
			this.deps.userAdmin.searchUsers(search.criteria, (page - 1) * PER_PAGE, PER_PAGE),
			this.deps.bans.listBannedUsernames(),
		]);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'users', template: 'admin_users_results.njk', title: lang.adminUsers.resultsHead },
			buildUserResults({ users, queryString: search.queryString, page, numPages, bannedUsernames, lang }),
		);
	}
}
