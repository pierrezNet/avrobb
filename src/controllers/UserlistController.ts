/**
 * Contrôleur de userlist.php : liste des membres, filtrée et triée.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MemberSort } from '../domain/models.ts';
import { type LayoutDeps, renderMessage, renderPage } from '../http/layout.ts';
import { buildUserlistPage, type UserlistQuery, userlistUrl } from '../presenters/userlistPage.ts';
import type { BanReader } from '../repositories/BanRepository.ts';
import type { MemberListReader } from '../repositories/UserRepository.ts';
import { clampPage, pageCount } from '../services/pagination.ts';
import { isAnyModerator } from '../services/permissions.ts';

export interface UserlistControllerDeps extends LayoutDeps {
	members: MemberListReader;
	bans: BanReader;
}

export interface UserlistParams {
	username?: string;
	show_group?: string;
	sort_by?: string;
	sort_dir?: string;
	p?: string;
}

/** Membres par page, fixe dans userlist.php. */
const PER_PAGE = 50;

/** Longueur maximale d'un pseudo FluxBB (le champ du formulaire en accepte 25). */
const MAX_USERNAME = 25;

export class UserlistController {
	constructor(private readonly deps: UserlistControllerDeps) {}

	show = async (request: FastifyRequest<{ Querystring: UserlistParams }>, reply: FastifyReply): Promise<FastifyReply> => {
		const { viewer, board: config } = request;
		const { lang } = this.deps.page;

		if (!viewer.group.canReadBoard) return renderMessage(request, reply, this.deps, 403, lang.common.noView);
		if (!viewer.group.canViewUsers) return renderMessage(request, reply, this.deps, 403, lang.common.noPermission);

		const showPostCount = config.showPostCount || isAnyModerator(viewer);
		const query = this.parseQuery(request.query, viewer.group.canSearchUsers, showPostCount);
		const filter = { username: query.username !== '' ? query.username : null, groupId: query.showGroup > -1 ? query.showGroup : null };

		const [numMembers, groups, bannedUsernames] = await Promise.all([
			this.deps.members.countMembers(filter),
			this.deps.members.listGroups(),
			this.deps.bans.listBannedUsernames(),
		]);
		const numPages = pageCount(numMembers, PER_PAGE);
		const page = clampPage(request.query.p, numPages);
		const direction = query.sortDir === 'DESC' ? 'desc' : 'asc';
		const members = await this.deps.members.listMembers(filter, query.sortBy, direction, (page - 1) * PER_PAGE, PER_PAGE);

		const view = buildUserlistPage({
			viewer,
			query,
			showPostCount,
			members,
			groups,
			bannedUsernames,
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
			'userlist.njk',
			{
				pageId: 'userlist',
				titleParts: [config.boardTitle, lang.common.userList],
				pageNumber: page,
				activeNav: 'userlist',
				allowIndex: true,
				canonicalUrl: userlistUrl(query, page),
			},
			view,
		);
	};

	/** Validation des critères, comme userlist.php : valeurs inconnues ramenées aux valeurs par défaut. */
	private parseQuery(params: UserlistParams, canSearchUsers: boolean, showPostCount: boolean): UserlistQuery {
		const username = canSearchUsers ? (params.username ?? '').trim().slice(0, MAX_USERNAME) : '';
		const group = Number.parseInt(params.show_group ?? '', 10);
		const sorts: readonly MemberSort[] = showPostCount ? ['username', 'registered', 'num_posts'] : ['username', 'registered'];
		const sortBy = sorts.find((sort) => sort === params.sort_by) ?? 'username';

		return {
			username,
			showGroup: Number.isSafeInteger(group) && group >= 0 ? group : -1,
			sortBy,
			sortDir: params.sort_dir === 'DESC' ? 'DESC' : 'ASC',
		};
	}
}
