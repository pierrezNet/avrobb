/**
 * Modèles de vue d'admin_groups.php : liste des groupes et formulaire d'un groupe. Fonctions pures.
 */

import { GroupId } from '../domain/models.ts';
import type { Lang } from '../lang/fr/index.ts';
import { type AdminGroup, GROUP_FLOOD_COLUMNS, type GroupColumn, visibleGroupColumns } from '../services/adminGroups.ts';

export interface AdminGroupListView {
	groups: { id: number; title: string; editHref: string; deleteHref: string | null }[];
	/** Groupes proposés comme base d'un nouveau groupe (tous sauf administrateurs). */
	baseGroups: { id: number; title: string; selected: boolean }[];
	/** Groupes possibles par défaut : ni administrateurs, ni invités, ni modérateurs. */
	defaultGroups: { id: number; title: string; selected: boolean }[];
	errors: string[];
	notice: string | null;
}

export function buildAdminGroupList(input: {
	groups: readonly AdminGroup[];
	defaultGroupId: number;
	errors: string[];
	notice: string | null;
}): AdminGroupListView {
	const { groups, defaultGroupId } = input;
	return {
		groups: groups.map((group) => ({
			id: group.id,
			title: group.title,
			editHref: `admin_groups.php?edit_group=${group.id}`,
			// Les quatre groupes prédéfinis ne se suppriment pas.
			deleteHref: group.id > GroupId.Member ? `admin_groups.php?del_group=${group.id}` : null,
		})),
		baseGroups: groups
			.filter((group) => group.id !== GroupId.Admin)
			.map((group) => ({ id: group.id, title: group.title, selected: group.id === defaultGroupId })),
		defaultGroups: groups
			.filter((group) => group.id > GroupId.Guest && group.values.g_moderator === 0)
			.map((group) => ({ id: group.id, title: group.title, selected: group.id === defaultGroupId })),
		errors: input.errors,
		notice: input.notice,
	};
}

export type GroupFieldView =
	| { kind: 'yesno'; name: string; label: string; help: string | null; checked: boolean }
	| { kind: 'number'; name: string; label: string; help: string | null; value: number }
	| { kind: 'select'; name: string; label: string; help: string | null; choices: { value: number; label: string; selected: boolean }[] };

export interface AdminGroupFormView {
	mode: 'add' | 'edit';
	groupId: number | null;
	baseGroupId: number | null;
	title: string;
	userTitle: string;
	fields: GroupFieldView[];
	showModeratorInfo: boolean;
	errors: string[];
}

/**
 * @param group groupe modifié, ou groupe de base d'un ajout (ses réglages sont proposés)
 */
export function buildAdminGroupForm(input: {
	mode: 'add' | 'edit';
	group: AdminGroup;
	groups: readonly AdminGroup[];
	defaultGroupId: number;
	errors: string[];
	lang: Lang;
}): AdminGroupFormView {
	const { mode, group, lang } = input;
	const t = lang.adminGroups;
	const editingDefault = mode === 'edit' && group.id === input.defaultGroupId;
	// Un ajout prend les champs d'un groupe ordinaire, sauf s'il est basé sur les invités.
	const shapeId = mode === 'add' && group.id === GroupId.Admin ? GroupId.Member : group.id;
	const field = (column: GroupColumn): GroupFieldView => {
		const name = column.slice(2);
		const texts = t.fields[column] ?? { label: column, help: null };
		const value = group.values[column];
		if (column === 'g_promote_next_group')
			return {
				kind: 'select',
				name,
				...texts,
				choices: [
					{ value: 0, label: t.disablePromotion, selected: value === 0 },
					...input.groups
						.filter((other) => (other.id !== group.id || mode === 'add') && other.id !== GroupId.Admin && other.id !== GroupId.Guest)
						.map((other) => ({ value: other.id, label: other.title, selected: other.id === value })),
				],
			};
		if (column === 'g_promote_min_posts' || (GROUP_FLOOD_COLUMNS as readonly string[]).includes(column))
			return { kind: 'number', name, ...texts, value };
		return { kind: 'yesno', name, ...texts, checked: value === 1 };
	};
	return {
		mode,
		groupId: mode === 'edit' ? group.id : null,
		baseGroupId: mode === 'add' ? group.id : null,
		title: mode === 'edit' ? group.title : '',
		userTitle: group.userTitle,
		fields: visibleGroupColumns(shapeId, editingDefault).map(field),
		showModeratorInfo: group.values.g_moderator === 1,
		errors: input.errors,
	};
}
