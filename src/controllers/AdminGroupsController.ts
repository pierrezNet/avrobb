/**
 * Groupes d'utilisateurs (admin_groups.php), réservés aux administrateurs : ajout (d'après un groupe
 * de base), modification, groupe par défaut et suppression avec déplacement des membres.
 */

import { GroupId } from '../domain/models.ts';
import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { buildAdminGroupForm, buildAdminGroupList } from '../presenters/adminGroupsPage.ts';
import type { ConfigCache } from '../repositories/ConfigLoader.ts';
import type { ConfigStore } from '../repositories/ConfigRepository.ts';
import type { GroupAdminStore } from '../repositories/GroupAdminRepository.ts';
import { type AdminGroup, readGroupForm } from '../services/adminGroups.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

export interface AdminGroupsControllerDeps extends LayoutDeps {
	groupAdmin: GroupAdminStore;
	configStore: ConfigStore;
	configCache: ConfigCache;
}

export interface AdminGroupsQuery {
	edit_group?: string;
	del_group?: string;
	done?: string;
}

type Notice = 'added' | 'edited' | 'removed' | 'default';

export class AdminGroupsController {
	constructor(private readonly deps: AdminGroupsControllerDeps) {}

	show = async (request: AppRequest<{ Querystring: AdminGroupsQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminGroups;
		const groups = await this.deps.groupAdmin.listGroups();

		if (request.query.edit_group !== undefined) {
			const group = groups.find((g) => g.id === positiveInt(request.query.edit_group));
			if (group === undefined) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return this.#renderForm(request, reply, 'edit', group, groups, []);
		}
		if (request.query.del_group !== undefined) return this.#deleteStep(request, reply, groups, positiveInt(request.query.del_group), null);

		const notices: Record<Notice, string> = { added: t.added, edited: t.edited, removed: t.removed, default: t.defaultSet };
		return this.#renderList(request, reply, groups, [], notices[request.query.done as Notice] ?? null);
	};

	submit = async (request: AppRequest<{ Querystring: AdminGroupsQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const { body } = request;
		const groups = await this.deps.groupAdmin.listGroups();
		const badRequest = (): Promise<AppReply> => renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		if (request.query.del_group !== undefined) {
			const id = positiveInt(field(body, 'group_to_delete') || request.query.del_group);
			return this.#deleteStep(request, reply, groups, id, body);
		}

		// Étape 1 d'un ajout : formulaire prérempli d'après le groupe de base.
		if (field(body, 'add_group') !== '') {
			const base = groups.find((g) => g.id === positiveInt(field(body, 'base_group')));
			if (base === undefined) return badRequest();
			return this.#renderForm(request, reply, 'add', base, groups, []);
		}

		if (field(body, 'add_edit_group') !== '') return this.#save(request, reply, groups);

		if (field(body, 'set_default_group') !== '') {
			const group = groups.find((g) => g.id === positiveInt(field(body, 'default_group')));
			if (group === undefined || group.id === GroupId.Admin || group.id === GroupId.Guest || group.values.g_moderator !== 0)
				return badRequest();
			await this.deps.configStore.updateValues(new Map([['o_default_user_group', String(group.id)]]));
			await this.deps.configCache.invalidate();
			return reply.redirect('admin_groups.php?done=default', 303);
		}
		return badRequest();
	};

	async #save(request: AppRequest<{ Body: FormBody }>, reply: AppReply, groups: readonly AdminGroup[]): Promise<AppReply> {
		const { lang } = this.deps.page;
		const { body } = request;
		const store = this.deps.groupAdmin;
		const mode = field(body, 'mode') === 'edit' ? 'edit' : 'add';
		const target = groups.find((g) => g.id === positiveInt(field(body, mode === 'edit' ? 'group_id' : 'base_group')));
		if (target === undefined) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		const read = (name: string): string | undefined => (typeof body[name] === 'string' ? body[name] : undefined);
		const settings = readGroupForm(
			read,
			mode === 'edit' ? target.id : null,
			groups.map((g) => g.id),
		);
		if (settings === null) return this.#renderForm(request, reply, mode, target, groups, [lang.adminGroups.missingTitle], 400);
		if (await store.titleExists(settings.title, mode === 'edit' ? target.id : null))
			return this.#renderForm(request, reply, mode, target, groups, [lang.adminGroups.titleExists(settings.title)], 400);

		if (mode === 'edit') await store.updateGroup(target.id, settings);
		else await store.addGroup(settings, target.id);
		return reply.redirect(`admin_groups.php?done=${mode === 'edit' ? 'edited' : 'added'}`, 303);
	}

	/** Suppression : confirmation, ou choix du groupe d'accueil des membres, puis effet (POST seulement). */
	async #deleteStep(
		request: AppRequest,
		reply: AppReply,
		groups: readonly AdminGroup[],
		id: number,
		body: FormBody | null,
	): Promise<AppReply> {
		const { lang } = this.deps.page;
		const t = lang.adminGroups;
		const group = groups.find((g) => g.id === id);
		if (group === undefined || id <= GroupId.Member) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (id === request.board.defaultUserGroup) return renderMessage(request, reply, this.deps, 400, t.cannotRemoveDefault);

		const members = await this.deps.groupAdmin.countMembers(id);
		if (body !== null) {
			if (members === 0 && field(body, 'del_group_comply') !== '') {
				await this.deps.groupAdmin.deleteGroup(id, null);
				return reply.redirect('admin_groups.php?done=removed', 303);
			}
			if (field(body, 'del_group') !== '') {
				const moveTo = groups.find((g) => g.id === positiveInt(field(body, 'move_to_group')));
				if (moveTo === undefined || moveTo.id === id || moveTo.id === GroupId.Guest)
					return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
				await this.deps.groupAdmin.deleteGroup(id, moveTo.id);
				return reply.redirect('admin_groups.php?done=removed', 303);
			}
		}
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'groups', template: 'admin_group_delete.njk', title: t.title },
			{
				group: { id: group.id, title: group.title },
				members,
				formAction: `admin_groups.php?del_group=${group.id}`,
				moveTargets: groups
					.filter((g) => g.id !== id && g.id !== GroupId.Guest)
					.map((g) => ({ id: g.id, title: g.title, selected: g.id === request.board.defaultUserGroup })),
			},
		);
	}

	#renderList(
		request: AppRequest,
		reply: AppReply,
		groups: readonly AdminGroup[],
		errors: string[],
		notice: string | null,
	): Promise<AppReply> {
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'groups', template: 'admin_groups.njk', title: this.deps.page.lang.adminGroups.title },
			buildAdminGroupList({ groups, defaultGroupId: request.board.defaultUserGroup, errors, notice }),
		);
	}

	#renderForm(
		request: AppRequest,
		reply: AppReply,
		mode: 'add' | 'edit',
		group: AdminGroup,
		groups: readonly AdminGroup[],
		errors: string[],
		status = 200,
	): Promise<AppReply> {
		const { lang } = this.deps.page;
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'groups', template: 'admin_group_edit.njk', title: lang.adminGroups.title },
			buildAdminGroupForm({ mode, group, groups, defaultGroupId: request.board.defaultUserGroup, errors, lang }),
		);
	}
}
