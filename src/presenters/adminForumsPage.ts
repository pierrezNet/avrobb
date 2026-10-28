/**
 * Modèles de vue d'admin_categories.php et d'admin_forums.php : listes, formulaire d'un forum avec
 * les permissions de chaque groupe. Fonctions pures.
 */

import type { AdminCategory, AdminForum, AdminForumRow } from '../repositories/ForumAdminRepository.ts';
import { differsFromGroup, effectivePermission, type GroupForumPermissionRow } from '../services/forumPermissions.ts';

export interface AdminCategoriesView {
	categories: { id: number; name: string; position: number }[];
	/** Catégorie dont la suppression attend confirmation. */
	confirmDelete: { id: number; name: string } | null;
	errors: string[];
	notice: string | null;
}

export function buildAdminCategories(input: {
	categories: readonly AdminCategory[];
	confirmDelete: AdminCategory | null;
	errors: string[];
	notice: string | null;
}): AdminCategoriesView {
	return {
		categories: input.categories.map(({ id, name, position }) => ({ id, name, position })),
		confirmDelete: input.confirmDelete !== null ? { id: input.confirmDelete.id, name: input.confirmDelete.name } : null,
		errors: input.errors,
		notice: input.notice,
	};
}

export interface AdminForumListView {
	categories: { id: number; name: string }[];
	groups: { name: string; forums: { id: number; name: string; position: number; editHref: string; deleteHref: string }[] }[];
	errors: string[];
	notice: string | null;
}

export function buildAdminForumList(input: {
	categories: readonly AdminCategory[];
	forums: readonly AdminForumRow[];
	errors: string[];
	notice: string | null;
}): AdminForumListView {
	const groups: AdminForumListView['groups'] = [];
	let currentCategory: number | null = null;
	for (const row of input.forums) {
		let group = groups.at(-1);
		if (group === undefined || row.categoryId !== currentCategory) {
			group = { name: row.categoryName, forums: [] };
			groups.push(group);
			currentCategory = row.categoryId;
		}
		group.forums.push({
			id: row.forumId,
			name: row.forumName,
			position: row.position,
			editHref: `admin_forums.php?edit_forum=${row.forumId}`,
			deleteHref: `admin_forums.php?del_forum=${row.forumId}`,
		});
	}
	return {
		categories: input.categories.map(({ id, name }) => ({ id, name })),
		groups,
		errors: input.errors,
		notice: input.notice,
	};
}

export interface PermissionCellView {
	checked: boolean;
	disabled: boolean;
	/** Diffère des réglages du groupe. */
	notDefault: boolean;
}

export interface AdminForumEditView {
	forum: { id: number; name: string; description: string; redirectUrl: string; redirectEditable: boolean };
	formAction: string;
	categories: { id: number; name: string; selected: boolean }[];
	sortOptions: { value: number; selected: boolean }[];
	permissions: {
		groupId: number;
		title: string;
		readForum: PermissionCellView;
		postReplies: PermissionCellView;
		postTopics: PermissionCellView;
	}[];
	errors: string[];
	notice: string | null;
}

export function buildAdminForumEdit(input: {
	forum: AdminForum;
	categories: readonly AdminCategory[];
	permissions: readonly GroupForumPermissionRow[];
	errors: string[];
	notice: string | null;
}): AdminForumEditView {
	const { forum } = input;
	const redirected = forum.redirectUrl !== '';
	return {
		forum: {
			id: forum.id,
			name: forum.name,
			description: forum.description,
			redirectUrl: forum.redirectUrl,
			redirectEditable: forum.numTopics === 0,
		},
		formAction: `admin_forums.php?edit_forum=${forum.id}`,
		categories: input.categories.map(({ id, name }) => ({ id, name, selected: id === forum.categoryId })),
		sortOptions: [0, 1, 2].map((value) => ({ value, selected: value === forum.sortBy })),
		permissions: input.permissions.map((row) => {
			const current = effectivePermission(row);
			const differs = differsFromGroup(row);
			return {
				groupId: row.groupId,
				title: row.title,
				readForum: { checked: current.readForum, disabled: !row.groupReadBoard, notDefault: differs.readForum },
				// Forum redirigé : seule la lecture se règle (cases désactivées, écart non signalé), comme le PHP.
				postReplies: { checked: current.postReplies, disabled: redirected, notDefault: differs.postReplies && !redirected },
				postTopics: { checked: current.postTopics, disabled: redirected, notDefault: differs.postTopics && !redirected },
			};
		}),
		errors: input.errors,
		notice: input.notice,
	};
}
