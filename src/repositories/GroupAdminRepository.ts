/**
 * Groupes d'utilisateurs (admin_groups.php) : lecture, ajout avec copie des permissions par forum du
 * groupe de base, modification, nombre de membres et suppression.
 */

import { sql } from 'kysely';
import { type Db, lastRow } from '../db/database.ts';
import { GroupId } from '../domain/models.ts';
import { type AdminGroup, GROUP_FLAG_COLUMNS, GROUP_FLOOD_COLUMNS, type GroupColumn, type GroupSettings } from '../services/adminGroups.ts';

export interface GroupAdminStore {
	listGroups(): Promise<AdminGroup[]>;
	/** Un autre groupe porte-t-il déjà ce nom ? */
	titleExists(title: string, exceptId: number | null): Promise<boolean>;
	/** Crée le groupe et recopie les permissions par forum de `baseGroupId` ; renvoie son identifiant. */
	addGroup(settings: GroupSettings, baseGroupId: number): Promise<number>;
	updateGroup(id: number, settings: GroupSettings): Promise<void>;
	countMembers(id: number): Promise<number>;
	/** Supprime le groupe (membres déplacés vers `moveTo` s'il est donné), ses permissions et les promotions vers lui. */
	deleteGroup(id: number, moveTo: number | null): Promise<void>;
	/** Droits de messagerie privée (g_pm, g_pm_limit) des groupes autres qu'administrateurs et invités. */
	listPrivateMessageRights(): Promise<{ id: number; title: string; allowed: boolean; limit: number }[]>;
	setPrivateMessageRights(id: number, allowed: boolean, limit: number): Promise<void>;
}

const COLUMNS: readonly GroupColumn[] = ['g_promote_min_posts', 'g_promote_next_group', ...GROUP_FLAG_COLUMNS, ...GROUP_FLOOD_COLUMNS];

const row = (settings: GroupSettings) => ({ g_title: settings.title, g_user_title: settings.userTitle, ...settings.values });

export class GroupAdminRepository implements GroupAdminStore {
	constructor(private readonly db: Db) {}

	async listGroups(): Promise<AdminGroup[]> {
		const rows = await this.db
			.selectFrom('groups')
			.select(['g_id', 'g_title', 'g_user_title', ...COLUMNS])
			.orderBy('g_id')
			.execute();
		return rows.map((group) => ({
			id: group.g_id,
			title: group.g_title,
			userTitle: group.g_user_title ?? '',
			values: Object.fromEntries(COLUMNS.map((column) => [column, group[column]])) as Record<GroupColumn, number>,
		}));
	}

	async titleExists(title: string, exceptId: number | null): Promise<boolean> {
		let query = this.db.selectFrom('groups').select('g_id').where('g_title', '=', title);
		if (exceptId !== null) query = query.where('g_id', '!=', exceptId);
		return (await query.executeTakeFirst()) !== undefined;
	}

	/** Nouveau groupe, avec les permissions par forum du groupe de base, dans un seul lot. */
	async addGroup(settings: GroupSettings, baseGroupId: number): Promise<number> {
		const lastGroupId = sql<number>`(SELECT MAX(g_id) FROM groups)`;
		const results = await this.db.batch([
			this.db.insertInto('groups').values(row(settings)),
			this.db
				.insertInto('forum_perms')
				.columns(['group_id', 'forum_id', 'read_forum', 'post_replies', 'post_topics'])
				.expression((eb) =>
					eb
						.selectFrom('forum_perms')
						.select([lastGroupId.as('group_id'), 'forum_id', 'read_forum', 'post_replies', 'post_topics'])
						.where('group_id', '=', baseGroupId),
				),
			this.db.selectNoFrom(lastGroupId.as('id')),
		]);
		return lastRow<{ id: number }>(results).id;
	}

	async updateGroup(id: number, settings: GroupSettings): Promise<void> {
		await this.db.updateTable('groups').set(row(settings)).where('g_id', '=', id).execute();
	}

	async countMembers(id: number): Promise<number> {
		const { total } = await this.db
			.selectFrom('users')
			.select((eb) => eb.fn.count<number>('id').as('total'))
			.where('group_id', '=', id)
			.executeTakeFirstOrThrow();
		return Number(total);
	}

	async deleteGroup(id: number, moveTo: number | null): Promise<void> {
		await this.db.batch([
			...(moveTo !== null ? [this.db.updateTable('users').set({ group_id: moveTo }).where('group_id', '=', id)] : []),
			this.db.deleteFrom('groups').where('g_id', '=', id),
			this.db.deleteFrom('forum_perms').where('group_id', '=', id),
			this.db.updateTable('groups').set({ g_promote_next_group: 0 }).where('g_promote_next_group', '=', id),
		]);
	}

	async listPrivateMessageRights(): Promise<{ id: number; title: string; allowed: boolean; limit: number }[]> {
		const rows = await this.db
			.selectFrom('groups')
			.select(['g_id', 'g_title', 'g_pm', 'g_pm_limit'])
			.where('g_id', 'not in', [GroupId.Admin, GroupId.Guest])
			.orderBy('g_id')
			.execute();
		return rows.map((row) => ({ id: row.g_id, title: row.g_title, allowed: row.g_pm === 1, limit: row.g_pm_limit }));
	}

	async setPrivateMessageRights(id: number, allowed: boolean, limit: number): Promise<void> {
		await this.db
			.updateTable('groups')
			.set({ g_pm: allowed ? 1 : 0, g_pm_limit: limit })
			.where('g_id', '=', id)
			.execute();
	}
}
