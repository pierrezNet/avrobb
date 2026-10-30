/**
 * Utilisateurs dans l'administration (admin_users.php), pour les administrateurs et modérateurs :
 * formulaire de recherche, statistiques d'adresses IP d'un membre (ip_stats), membres ayant écrit
 * depuis une adresse (show_users), résultats de recherche (find_user), et actions groupées sur les
 * comptes sélectionnés : changer de groupe et supprimer (administrateurs), bannir (administrateurs et
 * modérateurs autorisés). Chaque action passe par une étape de confirmation, comme le PHP.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { buildIpPosters, buildIpStats, buildUserResults, buildUserSearchForm } from '../presenters/adminUsersPage.ts';
import type { AvatarStore } from '../repositories/AvatarFiles.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { GroupAdminStore } from '../repositories/GroupAdminRepository.ts';
import type { UserAdminReader, UserAdminWriter } from '../repositories/UserAdminRepository.ts';
import { isIpAddress } from '../services/hosts.ts';
import { isAdmin } from '../services/permissions.ts';
import { parseBanExpire, readUserIds } from '../services/userActions.ts';
import { readUserSearch } from '../services/userSearch.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

/** Lignes par page, comme le PHP. */
const PER_PAGE = 50;

export interface AdminUsersControllerDeps extends LayoutDeps {
	userAdmin: UserAdminReader & UserAdminWriter;
	groupAdmin: GroupAdminStore;
	bans: Pick<BanReader, 'listBannedUsernames'>;
	avatarStore: AvatarStore;
}

/** Droits des actions groupées, ou null si aucune n'est permise ($can_action du PHP). */
function allowedActions(viewer: AppRequest['viewer']): ReturnType<typeof actionRights> | null {
	const rights = actionRights(viewer);
	return rights.move || rights.delete || rights.ban ? rights : null;
}

/** Droits sur les actions groupées ($can_move, $can_delete, $can_ban du PHP). */
function actionRights(viewer: AppRequest['viewer']): { move: boolean; delete: boolean; ban: boolean } {
	const admin = isAdmin(viewer);
	return { move: admin, delete: admin, ban: admin || (viewer.group.isModerator && viewer.group.canModBanUsers) };
}

export type AdminUsersQuery = Record<string, string | undefined>;

/** Page demandée (1 si hors limites), comme le PHP. */
function pageOf(requested: string | undefined, numPages: number): number {
	const page = positiveInt(requested);
	return page >= 1 && page <= numPages ? page : 1;
}

export class AdminUsersController {
	constructor(private readonly deps: AdminUsersControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminUsersQuery }>, reply: AppReply): Promise<AppReply> => {
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
			{ ...buildUserSearchForm(groups, this.deps.page.lang), notice: this.#notice(query.done) },
		);
	};

	async #ipStats(request: AppRequest<{ Querystring: AdminUsersQuery }>, reply: AppReply): Promise<AppReply> {
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

	async #ipPosters(request: AppRequest<{ Querystring: AdminUsersQuery }>, reply: AppReply): Promise<AppReply> {
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

	async #results(request: AppRequest<{ Querystring: AdminUsersQuery }>, reply: AppReply): Promise<AppReply> {
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
			{
				...buildUserResults({ users, queryString: search.queryString, page, numPages, bannedUsernames, lang }),
				actions: users.length > 0 ? allowedActions(request.viewer) : null,
			},
		);
	}

	#notice(done: string | undefined): string | null {
		const t = this.deps.page.lang.adminUsers;
		const notices: Record<string, string> = { moved: t.moved, deleted: t.deleted, banned: t.banned };
		return done !== undefined ? (notices[done] ?? null) : null;
	}

	/** Boutons des résultats (move_users, delete_users, ban_users) et leurs confirmations (*_comply). */
	submit = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, false);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminUsers;
		const { body } = request;
		const rights = actionRights(request.viewer);
		const has = (name: string): boolean => field(body, name) !== '';
		const action =
			has('move_users') || has('move_users_comply')
				? 'move'
				: has('delete_users') || has('delete_users_comply')
					? 'delete'
					: has('ban_users') || has('ban_users_comply')
						? 'ban'
						: null;
		if (action === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (!rights[action]) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const ids = readUserIds(body);
		if (ids.length === 0) return renderMessage(request, reply, this.deps, 400, t.noUsersSelected);
		const privileged = await this.deps.userAdmin.countPrivileged(ids);
		if (privileged.admins > 0)
			return renderMessage(
				request,
				reply,
				this.deps,
				400,
				action === 'move' ? t.noMoveAdmins : action === 'delete' ? t.noDeleteAdmins : t.noBanAdmins,
			);
		if (action === 'ban' && privileged.moderators > 0) return renderMessage(request, reply, this.deps, 400, t.noBanMods);

		if (action === 'move') return this.#move(request, reply, ids);
		if (action === 'delete') return this.#delete(request, reply, ids);
		return this.#ban(request, reply, ids);
	};

	async #move(request: AppRequest<{ Body: FormBody }>, reply: AppReply, ids: number[]): Promise<AppReply> {
		const t = this.deps.page.lang.adminUsers;
		const targets = await this.deps.userAdmin.listMoveTargets();
		if (field(request.body, 'move_users_comply') === '')
			return this.#confirm(request, reply, ids, 'move', { groups: targets.map(({ id, title }) => ({ id, title })) });
		const target = targets.find((group) => group.id === positiveInt(field(request.body, 'new_group')));
		if (target === undefined) return renderMessage(request, reply, this.deps, 400, t.invalidGroup);
		await this.deps.userAdmin.moveUsers(ids, target.id, target.isModerator);
		return reply.redirect('admin_users.php?done=moved', 303);
	}

	async #delete(request: AppRequest<{ Body: FormBody }>, reply: AppReply, ids: number[]): Promise<AppReply> {
		if (field(request.body, 'delete_users_comply') === '') return this.#confirm(request, reply, ids, 'delete', {});
		await this.deps.userAdmin.deleteUsers(ids, field(request.body, 'delete_posts') !== '');
		for (const id of ids) await this.deps.avatarStore.delete(id, request.board.avatarsDir);
		// generate_users_info_cache() : nombre de membres et dernier inscrit.
		return reply.redirect('admin_users.php?done=deleted', 303);
	}

	async #ban(request: AppRequest<{ Body: FormBody }>, reply: AppReply, ids: number[]): Promise<AppReply> {
		const t = this.deps.page.lang.adminUsers;
		const { body, viewer } = request;
		if (field(body, 'ban_users_comply') === '') return this.#confirm(request, reply, ids, 'ban', {});
		const offset = (viewer.timezone + (viewer.dst ? 1 : 0)) * 3600;
		const expire = parseBanExpire(field(body, 'ban_expire'), offset, this.deps.page.clock());
		if (expire === 'invalid') return renderMessage(request, reply, this.deps, 400, t.invalidDate);
		const message = field(body, 'ban_message').trim();
		await this.deps.userAdmin.banUsers(ids, {
			message: message !== '' ? message : null,
			expire,
			withIp: positiveInt(field(body, 'ban_the_ip')) !== 0,
			creatorId: viewer.id,
		});
		return reply.redirect('admin_users.php?done=banned', 303);
	}

	#confirm(
		request: AppRequest,
		reply: AppReply,
		ids: readonly number[],
		action: 'move' | 'delete' | 'ban',
		extra: object,
	): Promise<AppReply> {
		const t = this.deps.page.lang.adminUsers;
		const titles = { move: t.moveUsers, delete: t.deleteUsers, ban: t.banUsers };
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'users', template: 'admin_users_action.njk', title: titles[action] },
			{ action, heading: titles[action], users: ids.join(','), count: ids.length, ...extra },
		);
	}
}
