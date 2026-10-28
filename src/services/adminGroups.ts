/**
 * Groupes d'utilisateurs (admin_groups.php) : champs proposés selon le groupe et lecture du
 * formulaire avec les valeurs par défaut du PHP quand un champ n'est pas envoyé.
 */

import { GroupId } from '../domain/models.ts';

/** Colonnes de groupes réglées par le formulaire, dans son ordre. */
export const GROUP_FLAG_COLUMNS = [
	'g_moderator',
	'g_mod_edit_users',
	'g_mod_rename_users',
	'g_mod_change_passwords',
	'g_mod_ban_users',
	'g_read_board',
	'g_view_users',
	'g_post_replies',
	'g_post_topics',
	'g_edit_posts',
	'g_delete_posts',
	'g_delete_topics',
	'g_post_links',
	'g_set_title',
	'g_search',
	'g_search_users',
	'g_send_email',
] as const;

export const GROUP_FLOOD_COLUMNS = ['g_post_flood', 'g_search_flood', 'g_email_flood', 'g_report_flood'] as const;

export type GroupFlagColumn = (typeof GROUP_FLAG_COLUMNS)[number];
export type GroupFloodColumn = (typeof GROUP_FLOOD_COLUMNS)[number];
export type GroupColumn = GroupFlagColumn | GroupFloodColumn | 'g_promote_min_posts' | 'g_promote_next_group';

export interface AdminGroup {
	id: number;
	title: string;
	userTitle: string;
	values: Readonly<Record<GroupColumn, number>>;
}

export interface GroupSettings {
	title: string;
	/** null : titre par défaut (NULL en base). */
	userTitle: string | null;
	values: Record<GroupColumn, number>;
}

const MOD_COLUMNS: readonly GroupFlagColumn[] = [
	'g_moderator',
	'g_mod_edit_users',
	'g_mod_rename_users',
	'g_mod_change_passwords',
	'g_mod_ban_users',
];
const NOT_GUEST: ReadonlySet<GroupColumn> = new Set([
	'g_edit_posts',
	'g_delete_posts',
	'g_delete_topics',
	'g_set_title',
	'g_send_email',
	'g_email_flood',
	'g_report_flood',
]);

/**
 * Champs affichés pour un groupe, dans l'ordre du PHP : rien que les titres pour les administrateurs,
 * pas de promotion ni de modération pour les invités, pas de modération pour le groupe par défaut.
 */
export function visibleGroupColumns(groupId: number, editingDefaultGroup: boolean): GroupColumn[] {
	if (groupId === GroupId.Admin) return [];
	const isGuest = groupId === GroupId.Guest;
	const columns: GroupColumn[] = [];
	if (!isGuest) {
		columns.push('g_promote_next_group', 'g_promote_min_posts');
		if (!editingDefaultGroup) columns.push(...MOD_COLUMNS);
	}
	for (const column of [...GROUP_FLAG_COLUMNS, ...GROUP_FLOOD_COLUMNS])
		if (!MOD_COLUMNS.includes(column as GroupFlagColumn) && !(isGuest && NOT_GUEST.has(column))) columns.push(column);
	return columns;
}

/** intval() de PHP. */
function intval(value: string): number {
	const match = /^\s*[+-]?\d+/.exec(value);
	return match !== null ? Number.parseInt(match[0], 10) : 0;
}

/**
 * Lecture du formulaire (stage 2 d'admin_groups.php). `read(name)` renvoie le champ ou undefined
 * s'il est absent. `groupId` : groupe modifié (null pour un ajout).
 */
export function readGroupForm(
	read: (name: string) => string | undefined,
	groupId: number | null,
	existingGroupIds: readonly number[],
): GroupSettings | null {
	const title = (read('req_title') ?? '').trim();
	if (title === '') return null;
	const userTitle = (read('user_title') ?? '').trim();
	const isAdmin = groupId === GroupId.Admin;
	const is = (name: string): boolean => read(name) === '1';
	const orDefault = (name: string, fallback: number): number => {
		const value = read(name);
		return value === undefined ? fallback : intval(value) !== 0 ? 1 : 0;
	};
	const flood = (name: string): number => {
		const value = intval(read(name) ?? '0');
		return value >= 0 ? value : 0;
	};
	const next = Number(read('promote_next_group'));
	const moderator = is('moderator');

	return {
		title,
		userTitle: userTitle !== '' ? userTitle : null,
		values: {
			g_promote_min_posts: Math.max(0, intval(read('promote_min_posts') ?? '0')),
			g_promote_next_group:
				existingGroupIds.includes(next) && next !== GroupId.Admin && next !== GroupId.Guest && next !== groupId ? next : 0,
			g_moderator: moderator ? 1 : 0,
			g_mod_edit_users: moderator && is('mod_edit_users') ? 1 : 0,
			g_mod_rename_users: moderator && is('mod_rename_users') ? 1 : 0,
			g_mod_change_passwords: moderator && is('mod_change_passwords') ? 1 : 0,
			g_mod_ban_users: moderator && is('mod_ban_users') ? 1 : 0,
			g_read_board: orDefault('read_board', 1),
			g_view_users: is('view_users') || isAdmin ? 1 : 0,
			g_post_replies: orDefault('post_replies', 1),
			g_post_topics: orDefault('post_topics', 1),
			g_edit_posts: orDefault('edit_posts', isAdmin ? 1 : 0),
			g_delete_posts: orDefault('delete_posts', isAdmin ? 1 : 0),
			g_delete_topics: orDefault('delete_topics', isAdmin ? 1 : 0),
			g_post_links: orDefault('post_links', 1),
			g_set_title: orDefault('set_title', isAdmin ? 1 : 0),
			g_search: orDefault('search', 1),
			g_search_users: orDefault('search_users', 1),
			g_send_email: is('send_email') || isAdmin ? 1 : 0,
			g_post_flood: flood('post_flood'),
			g_search_flood: flood('search_flood'),
			g_email_flood: flood('email_flood'),
			g_report_flood: flood('report_flood'),
		},
	};
}
