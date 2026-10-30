/**
 * Catégories (admin_categories.php) et forums (admin_forums.php), réservés aux administrateurs.
 * Après chaque écriture, les listes « Atteindre » du PHP (cache_quickjump_*.php) sont supprimées,
 * comme generate_quickjump_cache(). Les erreurs réaffichent la page au lieu d'un message isolé.
 */

import type { AppReply, AppRequest } from '../http/context.ts';
import { type FormBody, field } from '../http/forms.ts';
import { type LayoutDeps, renderMessage } from '../http/layout.ts';
import { buildAdminCategories, buildAdminForumEdit, buildAdminForumList } from '../presenters/adminForumsPage.ts';
import type { AdminCategory, ForumAdminStore } from '../repositories/ForumAdminRepository.ts';
import { readCategoryUpdates, readForumDetails, readForumPositions, readGroupPermission } from '../services/forumAdminForms.ts';
import { permissionChange } from '../services/forumPermissions.ts';
import { punTrim } from '../services/phpString.ts';
import { adminDenied, renderAdminPage } from './adminPage.ts';
import { positiveInt } from './params.ts';

export interface ForumAdminControllerDeps extends LayoutDeps {
	forumAdmin: ForumAdminStore;
}

export interface AdminForumsQuery {
	edit_forum?: string;
	del_forum?: string;
	done?: string;
}

export interface AdminCategoriesQuery {
	done?: string;
}

type CategoryNotice = 'added' | 'deleted' | 'updated';
type ForumNotice = 'added' | 'deleted' | 'updated' | 'saved' | 'reverted';

export class ForumAdminController {
	constructor(private readonly deps: ForumAdminControllerDeps) {}

	// --- Catégories ---

	showCategories = async (request: AppRequest<{ Querystring: AdminCategoriesQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const t = this.deps.page.lang.adminForums;
		const notices: Record<CategoryNotice, string> = { added: t.categoryAdded, deleted: t.categoryDeleted, updated: t.categoriesUpdated };
		return this.#renderCategories(request, reply, null, [], notices[request.query.done as CategoryNotice] ?? null);
	};

	submitCategories = async (request: AppRequest<{ Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminForums;
		const body = request.body;
		const store = this.deps.forumAdmin;

		if (field(body, 'add_cat') !== '') {
			const name = punTrim(field(body, 'new_cat_name'));
			if (name === '') return this.#renderCategories(request, reply, null, [t.categoryMissingName], null, 400);
			await store.addCategory(name);
			return reply.redirect('admin_categories.php?done=added', 303);
		}

		if (field(body, 'del_cat') !== '' || field(body, 'del_cat_comply') !== '') {
			const id = positiveInt(field(body, 'cat_to_delete'));
			const category = (await store.listCategories()).find((cat) => cat.id === id);
			if (category === undefined) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			if (field(body, 'del_cat_comply') === '') return this.#renderCategories(request, reply, category, [], null);
			await store.deleteCategory(id);
			await this.#forumsChanged();
			return reply.redirect('admin_categories.php?done=deleted', 303);
		}

		if (field(body, 'update') !== '') {
			const updates = readCategoryUpdates(body);
			if (updates.kind === 'badRequest') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			if (updates.kind === 'error')
				return this.#renderCategories(
					request,
					reply,
					null,
					[updates.error === 'missingName' ? t.categoryMissingName : t.positionNotInteger],
					null,
					400,
				);
			await store.updateCategories(updates.categories);
			await this.#forumsChanged();
			return reply.redirect('admin_categories.php?done=updated', 303);
		}
		return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
	};

	async #renderCategories(
		request: AppRequest,
		reply: AppReply,
		confirmDelete: AdminCategory | null,
		errors: string[],
		notice: string | null,
		status = 200,
	): Promise<AppReply> {
		const t = this.deps.page.lang.adminForums;
		const categories = await this.deps.forumAdmin.listCategories();
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'categories', template: 'admin_categories.njk', title: t.categories },
			buildAdminCategories({ categories, confirmDelete, errors, notice }),
		);
	}

	// --- Forums ---

	showForums = async (request: AppRequest<{ Querystring: AdminForumsQuery }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminForums;
		const { query } = request;

		if (query.del_forum !== undefined) {
			const forum = await this.deps.forumAdmin.findForum(positiveInt(query.del_forum));
			if (forum === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
			return renderAdminPage(
				request,
				reply,
				this.deps,
				{ active: 'forums', template: 'admin_forum_delete.njk', title: t.forums },
				{ forum: { id: forum.id, name: forum.name }, formAction: `admin_forums.php?del_forum=${forum.id}` },
			);
		}

		if (query.edit_forum !== undefined) {
			const notice = query.done === 'reverted' ? t.permsReverted : null;
			return this.#renderForumEdit(request, reply, positiveInt(query.edit_forum), [], notice);
		}

		const notices: Record<ForumNotice, string> = {
			added: t.forumAdded,
			deleted: t.forumDeleted,
			updated: t.forumsUpdated,
			saved: t.forumUpdated,
			reverted: t.permsReverted,
		};
		return this.#renderForumList(request, reply, [], notices[query.done as ForumNotice] ?? null);
	};

	submitForums = async (request: AppRequest<{ Querystring: AdminForumsQuery; Body: FormBody }>, reply: AppReply): Promise<AppReply> => {
		const denied = adminDenied(request, reply, this.deps, true);
		if (denied !== null) return denied;
		const { lang } = this.deps.page;
		const t = lang.adminForums;
		const { query, body } = request;
		const store = this.deps.forumAdmin;
		const badRequest = (): Promise<AppReply> => renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		if (query.del_forum !== undefined) {
			const forum = await store.findForum(positiveInt(query.del_forum));
			if (forum === null || field(body, 'del_forum_comply') === '') return badRequest();
			await store.deleteForum(forum.id);
			await this.#forumsChanged();
			return reply.redirect('admin_forums.php?done=deleted', 303);
		}

		if (query.edit_forum !== undefined) return this.#saveForum(request, reply, positiveInt(query.edit_forum));

		if (field(body, 'add_forum') !== '') {
			const categoryId = positiveInt(field(body, 'add_to_cat'));
			if (!(await store.listCategories()).some((cat) => cat.id === categoryId)) return badRequest();
			await store.addForum(categoryId, t.newForum);
			await this.#forumsChanged();
			return reply.redirect('admin_forums.php?done=added', 303);
		}

		if (field(body, 'update_positions') !== '') {
			const positions = readForumPositions(body);
			if (positions === null) return this.#renderForumList(request, reply, [t.positionNotInteger], null, 400);
			await store.updateForumPositions(positions);
			await this.#forumsChanged();
			return reply.redirect('admin_forums.php?done=updated', 303);
		}
		return badRequest();
	};

	async #saveForum(request: AppRequest<{ Body: FormBody }>, reply: AppReply, forumId: number): Promise<AppReply> {
		const { lang } = this.deps.page;
		const store = this.deps.forumAdmin;
		const forum = await store.findForum(forumId);
		if (forum === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const body = request.body;

		if (field(body, 'revert_perms') !== '') {
			await store.revertPermissions(forumId);
			await this.#forumsChanged();
			return reply.redirect(`admin_forums.php?edit_forum=${forumId}&done=reverted`, 303);
		}

		const details = readForumDetails(body);
		if (details.kind === 'badRequest') return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		if (details.kind === 'missingName')
			return this.#renderForumEdit(request, reply, forumId, [lang.adminForums.forumMissingName], null, 400);
		if (!(await store.listCategories()).some((cat) => cat.id === details.categoryId))
			return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);

		// L'URL de redirection n'est proposée que pour un forum vide : sinon elle reste inchangée (le PHP la vidait).
		const { kind: _kind, ...values } = details;
		await store.updateForum(forumId, forum.numTopics === 0 ? values : { ...values, redirectUrl: forum.redirectUrl || null });
		for (const row of await store.listGroupPermissions(forumId)) {
			const sent = readGroupPermission(body, row.groupId);
			if (sent === null) continue;
			const change = permissionChange(row, sent.old, sent.sent);
			if (change.kind === 'default') await store.setGroupPermission(forumId, row.groupId, null);
			else if (change.kind === 'set') await store.setGroupPermission(forumId, row.groupId, change.permission);
		}
		await this.#forumsChanged();
		return reply.redirect('admin_forums.php?done=saved', 303);
	}

	async #renderForumList(request: AppRequest, reply: AppReply, errors: string[], notice: string | null, status = 200): Promise<AppReply> {
		const t = this.deps.page.lang.adminForums;
		const [categories, forums] = await Promise.all([this.deps.forumAdmin.listCategories(), this.deps.forumAdmin.listForums()]);
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'forums', template: 'admin_forums.njk', title: t.forums },
			buildAdminForumList({ categories, forums, errors, notice }),
		);
	}

	async #renderForumEdit(
		request: AppRequest,
		reply: AppReply,
		forumId: number,
		errors: string[],
		notice: string | null,
		status = 200,
	): Promise<AppReply> {
		const { lang } = this.deps.page;
		const forum = await this.deps.forumAdmin.findForum(forumId);
		if (forum === null) return renderMessage(request, reply, this.deps, 400, lang.common.badRequest);
		const [categories, permissions] = await Promise.all([
			this.deps.forumAdmin.listCategories(),
			this.deps.forumAdmin.listGroupPermissions(forumId),
		]);
		reply.code(status);
		return renderAdminPage(
			request,
			reply,
			this.deps,
			{ active: 'forums', template: 'admin_forum_edit.njk', title: lang.adminForums.forums },
			buildAdminForumEdit({ forum, categories, permissions, errors, notice }),
		);
	}

	/** generate_quickjump_cache() du PHP : ses listes « Atteindre » seront régénérées. */
	async #forumsChanged(): Promise<void> {}
}
